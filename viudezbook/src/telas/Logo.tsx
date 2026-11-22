// Logo "V-livro": um V formado por duas páginas abertas, com uma onda sonora saindo do meio.
export default function Logo({ tamanho = 40, fundo = true }: { tamanho?: number; fundo?: boolean }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 512 512" role="img" aria-label="Viudezbook">
      {fundo && <rect width="512" height="512" rx="112" fill="#16151b" />}
      <g strokeLinecap="round" strokeLinejoin="round">
        {/* página esquerda */}
        <path d="M256 404 L118 168 Q150 140 196 150 L256 254 Z" fill="#FF6A2B" />
        {/* página direita */}
        <path d="M256 404 L394 168 Q362 140 316 150 L256 254 Z" fill="#FF8A57" />
        {/* linhas das páginas */}
        <path d="M168 196 L224 292 M152 222 L206 314" stroke="#16151b" strokeWidth="10" opacity=".35" />
        <path d="M344 196 L288 292 M360 222 L306 314" stroke="#16151b" strokeWidth="10" opacity=".35" />
        {/* onda sonora */}
        <g stroke="#F4EFE6" strokeWidth="18">
          <path d="M256 92 L256 214" />
          <path d="M222 130 L222 186" />
          <path d="M290 130 L290 186" />
          <path d="M188 148 L188 168" />
          <path d="M324 148 L324 168" />
        </g>
      </g>
    </svg>
  );
}
