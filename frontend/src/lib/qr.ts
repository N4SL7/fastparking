import qrcode from 'qrcode-generator';

/** Devuelve el QR como un único "path" SVG (módulos oscuros) y su tamaño en módulos. */
export function qrComoPath(texto: string): { path: string; tamano: number } {
  const qr = qrcode(0, 'M');
  qr.addData(texto);
  qr.make();
  const n = qr.getModuleCount();
  let path = '';
  for (let f = 0; f < n; f++) {
    for (let c = 0; c < n; c++) if (qr.isDark(f, c)) path += `M${c} ${f}h1v1h-1z`;
  }
  return { path, tamano: n };
}
