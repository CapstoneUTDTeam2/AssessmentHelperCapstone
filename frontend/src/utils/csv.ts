/** Builds a CSV file from a header row and data rows and starts a browser download. */
export function downloadCsv(filename: string, header: string[], rows: string[][]) {
  const csv = [header, ...rows].map((cells) => cells.map((c) => `"${c.replaceAll('"', '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
