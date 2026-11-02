import { Card } from "../components/ui";

export function Connections() {
  return (
    <div className="flex flex-col gap-4">
      <Card title="Conexões">
        <p className="text-sm text-muted">
          Open Finance é o sistema do Banco Central para você autorizar a leitura de saldos e extratos. A Arvia não pede a senha do banco. A leitura passa por um agregador licenciado, e nada é lido sem a sua autorização no próprio banco.
        </p>
        <p className="mt-3 text-sm font-medium">A conexão real com seus bancos chega na próxima etapa.</p>
      </Card>
    </div>
  );
}
