/**
 * 管理端冒烟脚本：登录 → 五个页签 → 模拟参数预览 → 重置演示数据 → 截图
 * 依赖：先启动 `pnpm dev`（默认 http://127.0.0.1:5173），再执行 `pnpm shot`。
 * 使用系统 Edge（playwright-core，不额外下载浏览器）。
 */
import { mkdir, readdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = join(root, 'docs', 'screenshots');
const baseUrl = process.env.SHOT_BASE_URL ?? 'http://127.0.0.1:5173';
const failures = [];

function watch(page, tag) {
  page.on('pageerror', (error) => failures.push(`[${tag}] pageerror: ${error.message}`));
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().includes('favicon')) {
      failures.push(`[${tag}] http ${response.status()}: ${response.url()}`);
    }
  });
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (text.includes('favicon') || text.includes('/@vite/client')) return;
    failures.push(`[${tag}] console: ${text}`);
  });
}

/** 当前可见页签内的表格（el-tabs 懒加载会保留隐藏页签，需限定 visible） */
function visibleTable(page) {
  return page.locator('.el-tab-pane:visible .el-table').first();
}

function visibleRow(page, index = 0) {
  return page.locator('.el-tab-pane:visible .el-table__row:visible').nth(index);
}

/** 等数据真正渲染完成（mock 层有 120-280ms 延迟，截图前必须等行出现） */
async function waitTableData(page) {
  await visibleTable(page).waitFor({ timeout: 15000 });
  await visibleRow(page).waitFor({ timeout: 15000 });
  await page.waitForTimeout(250);
}

async function screenshot(page, name) {
  await page.screenshot({ path: join(outDir, name), fullPage: false });
}

async function main() {
  await mkdir(outDir, { recursive: true });
  // 只清理本脚本产出的顶层截图，保留 backend/ 等其他子目录
  for (const entry of await readdir(outDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.png')) {
      await rm(join(outDir, entry.name), { force: true });
    }
  }
  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  try {
    // 1. 管理员：登录 → 五个页签
    const adminContext = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      locale: 'zh-CN'
    });
    const page = await adminContext.newPage();
    watch(page, 'admin');

    await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
    await screenshot(page, 'login.png');

    await page.getByPlaceholder('请输入账号').fill('admin');
    await page.getByPlaceholder('请输入密码').fill('admin123');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.waitForURL((url) => url.pathname === '/admin', { timeout: 15000 });
    await page.getByRole('tab', { name: '用户管理' }).waitFor();
    await waitTableData(page);
    await screenshot(page, 'admin-users.png');

    await page.getByRole('tab', { name: '厂商管理' }).click();
    await page.getByRole('button', { name: '新增厂商' }).waitFor();
    await waitTableData(page);
    await screenshot(page, 'admin-vendors.png');

    await page.getByRole('button', { name: '新增厂商' }).click();
    await page.locator('.el-dialog:visible').waitFor();
    await page.waitForTimeout(150);
    await screenshot(page, 'admin-vendor-dialog.png');
    await page.keyboard.press('Escape');
    await page.locator('.el-dialog:visible').waitFor({ state: 'hidden' });

    // 模拟参数：计划选择 → 参数配置 → 效果预览（分屏截图，避免长页固定侧边栏错位）
    await page.getByRole('tab', { name: '模拟参数' }).click();
    await page.getByRole('button', { name: '预览效果' }).waitFor();
    await waitTableData(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);
    await screenshot(page, 'admin-mock-plans.png');

    await page.getByText('参数配置', { exact: true }).evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.evaluate(() => window.scrollBy(0, -80));
    await page.waitForTimeout(250);
    await screenshot(page, 'admin-mock-config.png');

    await visibleRow(page).locator('.el-checkbox').click();
    await page.getByRole('button', { name: '预览效果' }).click();
    await page.getByText('预计总曝光量').first().waitFor({ timeout: 20000 });
    await page.locator('canvas:visible').first().waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForTimeout(400);
    await page
      .getByText('效果预览与生成', { exact: true })
      .evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(300);
    await screenshot(page, 'admin-mock-preview.png');

    // 覆盖生成：验证真实写库链路（确认框 → 生成 → 结果回写 → 操作日志）
    await page.getByRole('button', { name: '覆盖生成' }).click();
    await page.locator('.el-message-box:visible').waitFor();
    await page.locator('.el-message-box__btns .el-button--primary').click();
    await page
      .locator('.el-message')
      .filter({ hasText: '已完成' })
      .first()
      .waitFor({ timeout: 20000 });
    await page.waitForTimeout(800);
    await page
      .getByText('本次生成结果', { exact: true })
      .evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.evaluate(() => window.scrollBy(0, -80));
    await page.waitForTimeout(300);
    await screenshot(page, 'admin-mock-generated.png');

    await page.getByRole('tab', { name: '字典配置' }).click();
    await page.getByText('渠道字典').first().waitFor();
    await waitTableData(page);
    await screenshot(page, 'admin-dicts.png');
    await page.getByText('指标口径').first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await screenshot(page, 'admin-dicts-metrics.png');

    await page.getByRole('tab', { name: '操作日志' }).click();
    await page.getByText('操作时间').first().waitFor();
    await waitTableData(page);
    await screenshot(page, 'admin-logs.png');

    // 重置演示数据（可反复演示）
    await page.getByRole('button', { name: '重置演示数据' }).click();
    await page.locator('.el-message-box:visible').waitFor();
    await page.locator('.el-message-box__btns .el-button--primary').click();
    await page.waitForTimeout(1500);
    await page.getByRole('tab', { name: '用户管理' }).waitFor();
    await page.evaluate(() => window.scrollTo(0, 0));
    await waitTableData(page);
    await screenshot(page, 'admin-after-reset.png');

    // 2. 普通用户：登录后应落到 403 说明页
    const userContext = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      locale: 'zh-CN'
    });
    const userPage = await userContext.newPage();
    watch(userPage, 'user');
    await userPage.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
    await userPage.getByPlaceholder('请输入账号').fill('user01');
    await userPage.getByPlaceholder('请输入密码').fill('user123');
    await userPage.getByRole('button', { name: '登录', exact: true }).click();
    await userPage.waitForURL((url) => url.pathname === '/403', { timeout: 15000 });
    await userPage.getByText('无管理端访问权限').first().waitFor();
    await userPage.screenshot({ path: join(outDir, 'forbidden.png'), fullPage: false });

    // 3. 受限路由守卫：未登录直访 /admin 应跳登录
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    watch(guestPage, 'guest');
    await guestPage.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle' });
    await guestPage.waitForURL((url) => url.pathname === '/login', { timeout: 15000 });
  } finally {
    await browser.close();
  }

  if (failures.length > 0) {
    console.error('\n冒烟检查发现以下问题：');
    failures.forEach((item) => console.error(` - ${item}`));
    process.exitCode = 1;
  } else {
    console.log(`\n冒烟通过，截图已输出到 ${outDir}`);
  }
}

main().catch((error) => {
  console.error('冒烟脚本执行失败：', error);
  process.exitCode = 1;
});
