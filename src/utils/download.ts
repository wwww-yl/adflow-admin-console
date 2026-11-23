/** 前端导出 CSV（技术方案 4.8.4 操作日志导出、10.3 前端不生成真实业务文件，仅演示用） */
export type CsvCell = string | number | boolean | null | undefined;

function escapeCell(cell: CsvCell): string {
  const text = cell === null || cell === undefined ? '' : String(cell);
  return `"${text.replace(/"/g, '""')}"`;
}

export function downloadCsv(filename: string, rows: CsvCell[][]): void {
  const content = rows.map((row) => row.map(escapeCell).join(',')).join('\r\n');
  // BOM 防止 Excel 打开中文乱码
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
