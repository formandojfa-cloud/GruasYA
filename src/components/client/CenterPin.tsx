/** Pin fijo al centro del mapa: el usuario arrastra el mapa, no el pin (🚗 tu vehículo, 🏁 destino). */
export function CenterPin({ kind }: { kind: "pickup" | "dropoff" }) {
  const fill = kind === "pickup" ? "#1d1d1f" : "#1f8a4c";
  const glyph = kind === "pickup" ? "🚗" : "🏁";
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-full drop-shadow-md" aria-hidden>
      <svg width="40" height="51" viewBox="0 0 36 46">
        <path d="M18 45c-1-7-16-17-16-27A16 16 0 0 1 34 18c0 10-15 20-16 27z" fill={fill} stroke="#fff" strokeWidth="2" />
        <circle cx="18" cy="18" r="11" fill="#fff" />
        <text x="18" y="24" textAnchor="middle" fontSize="15" fontFamily="system-ui">
          {glyph}
        </text>
      </svg>
    </div>
  );
}
