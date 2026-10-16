import Link from "next/link";

// Página temporal. La app del cliente reemplaza este archivo.
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-bold">Asistencia Vial</h1>
      <p className="text-muted">Prototipo en construcción.</p>
      <nav className="flex flex-col gap-2">
        <Link className="underline" href="/driver">
          App del proveedor
        </Link>
        <Link className="underline" href="/pbx">
          Panel del PBX
        </Link>
      </nav>
    </main>
  );
}
