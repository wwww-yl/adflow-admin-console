/**
 * 真实后端模式冒烟测试（需要先启动 `pnpm dev:backend`）
 *
 * 验证链路：登录（账号密码从环境变量 SMOKE_ACCOUNT / SMOKE_PASSWORD 读取）
 *          → 用户管理 → 厂商管理 → 模拟参数（勾选计划 → 预览 → 生成）
 *          → 操作日志 → 字典配置，全程截图到 docs/screenshots/backend/
 *
 * 用法：$env:SMOKE_ACCOUNT='<账号>'; $env:SMOKE_PASSWORD='<密码>'; node scripts/smoke-backend.mjs
 */
import { rm, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const BASE = process.env.SMOKE_BASE ?? 'http://127.0.0.1:5173';
const OUT_DIR = 'docs/screenshots/backend';
const ACCOUNT = process.env.SMOKE_ACCOUNT ?? '';
const PASSWORD = process.env.SMOKE_PASSWORD ?? '';

if (!ACCOUNT || !PASSWORD) {
  console.error('缺少 SMOKE_ACCOUNT / SMOKE_PASSWORD 环境变量（使用后端管理员账号，勿写入仓库）');
  process.exit(1);
}

const failures = [];

function noteFailure(message) {
  failures.push(message);
  console.error('FAIL:', message);
}

async function shot(page, name) {
  await page.screenshot({ path: `${OUT_DIR}/${name}.png`, fullPage: false });
  console.log('screenshot:', `${OUT_DIR}/${name}.png`);
}

async function visiblePane(page) {
  return page.locator('.el-tab-pane:visible').first();
}

async function waitTableRows(page, min = 1) {
  const pane = await visiblePane(page);
  await pane.locator('.el-table__row').first().waitFor({ timeout: 20000 });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if ((await pane.locator('.el-table__row').count()) >= min) {
      await page.waitForTimeout(350);
      return pane.locator('.el-table__row');
    }
    await page.waitForTimeout(200);
  }
  throw new Error(`等待表格数据超时（至少 ${min} 行）`);
}

async function main() {
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();

  page.on('pageerror', (error) => noteFailure(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (text.includes('favicon')) return;
    noteFailure(`console.error: ${text}`);
  });
  page.on('response', (response) => {
    if (response.url().includes('favicon')) return;
    if (response.status() >= 400) {
      noteFailure(`HTTP ${response.status()}: ${response.url()}`);
    }
  });

  // 1. 登录
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('请输入账号').fill(ACCOUNT);
  await page.getByPlaceholder('请输入密码').fill(PASSWORD);
  await shot(page, 'login');
  await page.getByRole('button', { name: /^登录/ }).click();

  await page.waitForURL(/\/admin/, { timeout: 20000 });
  await page.waitForSelector('.el-tab-pane:visible .el-table', { timeout: 20000 });
  const userRows = await waitTableRows(page);
  console.log('users rows:', await userRows.count());
  await shot(page, 'users');

  // 2. 厂商管理
  await page.getByRole('tab', { name: '厂商管理' }).click();
  await page.waitForTimeout(600);
  await shot(page, 'vendors');

  // 3. 模拟参数（依赖后端已有计划）
  await page.getByRole('tab', { name: '模拟参数' }).click();
  // 只取第一个表格（计划选择）的行，避免误把下方调节记录的行当成计划
  const planTable = page.locator('.el-tab-pane:visible .el-table').first();
  const hasPlans = await planTable
    .locator('.el-table__row')
    .first()
    .waitFor({ timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  const planRows = planTable.locator('.el-table__row');
  const planCount = hasPlans ? await planRows.count() : 0;
  console.log('campaign rows:', planCount);
  if (planCount === 0) {
    await page.waitForTimeout(500);
    await shot(page, 'mock-plans');
    console.log('WARN: 后端没有投放计划，跳过模拟参数生成链路');
  } else {
    await planRows.first().locator('.el-checkbox').first().click();
    await page.getByRole('button', { name: '预览效果' }).click();
    await page.getByText('预计总曝光量').first().waitFor({ timeout: 20000 });
    await page.locator('canvas:visible').first().waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForTimeout(400);
    await page
      .getByText('效果预览与生成', { exact: true })
      .evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.evaluate(() => window.scrollBy(0, -80));
    await page.waitForTimeout(300);
    await shot(page, 'mock-preview');

    // 用「覆盖生成」：后端数据可能由其他人/其他流程先写过，避免 generate 模式的前端拦截
    await page.getByRole('button', { name: '覆盖生成' }).click();
    await page.locator('.el-message-box:visible').waitFor();
    await page.locator('.el-message-box__btns .el-button--primary').click();
    await page
      .locator('.el-message')
      .filter({ hasText: '已完成' })
      .first()
      .waitFor({ timeout: 60000 });
    await page.waitForTimeout(1200);
    await page
      .getByText('本次生成结果', { exact: true })
      .evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.evaluate(() => window.scrollBy(0, -80));
    await page.waitForTimeout(300);
    await shot(page, 'mock-generated');
  }

  // 4. 操作日志
  await page.getByRole('tab', { name: '操作日志' }).click();
  await page.waitForTimeout(800);
  const logRows = await page.locator('.el-tab-pane:visible .el-table__row').count();
  console.log('log rows:', logRows);
  if (logRows === 0) noteFailure('操作日志没有数据');
  await shot(page, 'logs');

  // 5. 字典配置（真实后端为前端内置只读口径）
  await page.getByRole('tab', { name: '字典配置' }).click();
  await page.waitForTimeout(800);
  await shot(page, 'dicts');

  await browser.close();

  if (failures.length > 0) {
    console.error(`\n冒烟失败：${failures.length} 个问题`);
    process.exitCode = 1;
  } else {
    console.log('\n真实后端冒烟通过，截图输出到', OUT_DIR);
  }
}

main().catch((error) => {
  console.error('冒烟脚本异常：', error);
  process.exitCode = 1;
});
