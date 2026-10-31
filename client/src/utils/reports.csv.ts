
export type CsvCell =
  | string
  | number
  | boolean
  | null
  | undefined;

function escapeCsvCell(value: CsvCell): string {
  if (value === null || value === undefined) {
    return "";
  }

  let text = String(value);

  // Spreadsheet formula injection protection:
  // do not allow externally sourced strings
  // to be interpreted as Excel formulas.
  if (
    typeof value === "string" &&
    /^\s*[=+\-@]/.test(text)
  ) {
    text = `'${text}`;
  }

  return `"${text.replaceAll('"', '""')}"`;
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: CsvCell[][]
): void {
  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map(
      (row) => row.map(escapeCsvCell).join(",")
    ),
  ];

  // UTF-8 BOM improves recognition in
  // some spreadsheet programs.
  const content = "\uFEFF" + lines.join("\r\n");

  const blob = new Blob(
    [content],
    {
      type: "text/csv;charset=utf-8;",
    }
  );

  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}
