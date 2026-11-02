import { describe, expect, it } from "vitest";
import { parseGenericHtml, parsePrHtml, resolveNfce } from "../../server/nfce";
import { extractAccessKey, isAccessKeyOnly, isNfceUrl } from "./nfceUrl";
import { suggestCategoryName } from "./suggestCategory";

const KEY = "41261012345678000190650010000012341000012349";
const prHtml = `
<html><body>
<div class="txtTopo">MUFFATO SUPERMERCADOS LTDA</div>
<div>CNPJ: 79.379.491/0001-83</div>
<table>
<tr id="Item + 1"><td><span class="txtTit">ARROZ TIPO 1 5KG</span><span class="Rqtd"><strong>Qtde.:</strong>1</span><span class="RUN"><strong>UN: </strong>UN</span><span class="valor">28,90</span></td></tr>
<tr id="Item + 2"><td><span class="txtTit">FEIJAO CARIOCA</span><span class="Rqtd"><strong>Qtde.:</strong>2</span><span class="RUN"><strong>UN: </strong>UN</span><span class="valor">1.016,10</span></td></tr>
</table>
<div>Valor a pagar R$: 1.045,00</div>
<div>Forma de pagamento: Cartão de Débito</div>
<div>Emissão: 20/10/2026 18:30:10</div>
</body></html>`;

describe("nfceUrl", () => {
  it("reconhece URLs de nota", () => {
    expect(isNfceUrl("https://www.fazenda.pr.gov.br/nfce/qrcode?p=" + KEY + "|2|1")).toBe(true);
    expect(isNfceUrl("https://exemplo.com/loja")).toBe(false);
    expect(isNfceUrl(KEY)).toBe(false);
  });
  it("chave sozinha não consulta", () => {
    expect(isAccessKeyOnly(KEY)).toBe(true);
    expect(extractAccessKey("https://x.sefaz.gov.br/?p=" + KEY)).toBe(KEY);
  });
});

describe("parsePrHtml", () => {
  it("lê dois itens e o total", () => {
    const r = parsePrHtml(prHtml);
    expect(r).not.toBeNull();
    expect(r?.items).toHaveLength(2);
    expect(r?.totalCents).toBe(104500);
    expect(r?.cnpj).toBe("79379491000183");
    expect(r?.payment).toBe("debito");
    expect(r?.state).toBe("PR");
    expect(r?.issuedAt.startsWith("2026-10-20")).toBe(true);
  });
  it("html vazio devolve null", () => {
    expect(parsePrHtml("<html></html>")).toBeNull();
    expect(parseGenericHtml("<html></html>")).toBeNull();
  });
});

describe("resolveNfce", () => {
  const url = "https://www.fazenda.pr.gov.br/nfce/qrcode?p=" + KEY;
  it("200 com HTML do Paraná", async () => {
    const f = (async () => new Response(prHtml)) as typeof fetch;
    const r = await resolveNfce(url, f);
    expect(r.status).toBe(200);
  });
  it("422 com HTML sem itens", async () => {
    const f = (async () => new Response("<html></html>")) as typeof fetch;
    expect((await resolveNfce(url, f)).status).toBe(422);
  });
  it("502 quando a rede falha", async () => {
    const f = (async () => { throw new Error("x"); }) as typeof fetch;
    expect((await resolveNfce(url, f)).status).toBe(502);
  });
  it("400 para URL inválida e para host privado", async () => {
    expect((await resolveNfce("https://exemplo.com")).status).toBe(400);
    expect((await resolveNfce("http://127.0.0.1/nfce?p=" + KEY)).status).toBe(400);
  });
});

describe("suggestCategoryName", () => {
  it("sugere sem acento", () => {
    expect(suggestCategoryName("MUFFATO", "pessoal")).toBe("Mercado");
    expect(suggestCategoryName("Posto Ipiranga", "pessoal")).toBe("Gasolina");
    expect(suggestCategoryName("Farmácia Rosário", "pessoal")).toBe("Saúde e bem-estar");
    expect(suggestCategoryName("Loja X", "pessoal")).toBe("Compras online");
    expect(suggestCategoryName("Loja X", "casa")).toBe("Outras");
  });
});

describe("parsePrHtml com a página real do Paraná", () => {
  it("ignora 'EMISSÃO NORMAL' e lê a data de emissão certa, com entidades HTML", () => {
    const html = `<div class="txtTopo">LOJA &amp; CIA</div><div>CNPJ: 10.609.274/0001-36</div>
      <table id="tabResult"><tr id="Item + 1"><td><span class="txtTit">BAL&Atilde;O</span><span class="Rqtd"><strong>Qtde.:</strong>1</span><span class="RUN"><strong>UN: </strong>UN</span></td><td><span class="valor">28,90</span></td></tr></table>
      <div>Valor a pagar R$:<span class="totalNumb">28,90</span></div><div>Dinheiro</div>
      <h4>EMISSÃO NORMAL</h4><li><strong>Emiss&atilde;o: </strong>26&#x2F;10&#x2F;2026 17:02:36  - Via Consumidor</li>`;
    const r = parsePrHtml(html)!;
    expect(r.issuedAt).toBe("2026-10-26T17:02:36");
    expect(r.storeName).toBe("LOJA & CIA");
    expect(r.items[0]).toMatchObject({ description: "BALÃO", totalCents: 2890 });
    expect(r.payment).toBe("dinheiro");
  });
});
