import { useState } from "react";

const CORES = ["#FF6A2B", "#2F9E8F", "#8A5CF6", "#D9485F", "#C9A227", "#3D7EA6"];

export default function Capa({ livro, tamanho = 64 }: { livro: { titulo: string; capa_url: string | null }; tamanho?: number }) {
  const [falhou, setFalhou] = useState(false);
  const estilo = { width: tamanho, height: Math.round(tamanho * 1.45) };
  if (livro.capa_url && !falhou) {
    return <img className="capa" style={estilo} src={livro.capa_url} alt="" loading="lazy" onError={() => setFalhou(true)} />;
  }
  const cor = CORES[[...livro.titulo].reduce((s, c) => s + c.charCodeAt(0), 0) % CORES.length];
  return (
    <div className="capa gerada" style={{ ...estilo, background: cor, fontSize: tamanho / 4 }}>
      {livro.titulo.slice(0, 1).toUpperCase()}
    </div>
  );
}
