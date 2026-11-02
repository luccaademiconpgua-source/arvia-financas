import { Link } from "react-router";
import { Card } from "../components/ui";

export function NotFound() {
  return (
    <Card title="Página não encontrada">
      <p className="text-sm text-muted">Esse endereço não existe no Arvia.</p>
      <Link to="/" className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-brand underline underline-offset-4">
        Voltar ao início
      </Link>
    </Card>
  );
}
