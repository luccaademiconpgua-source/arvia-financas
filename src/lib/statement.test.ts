import { describe, expect, it } from "vitest";
import { decodeStatement, parseAmount, parseCsv, parseDate, parseOfx, parseStatement, suggestStatementCategory, looksInverted, cleanMerchantName } from "./statement";

const OFX_SGML = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
ENCODING:USASCII
CHARSET:1252

<OFX>
<SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS><DTSERVER>20261101120000[-3:BRT]<LANGUAGE>POR</SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><TRNUID>1<STMTRS><CURDEF>BRL
<BANKACCTFROM><BANKID>0341<ACCTID>12345-6<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20261001<DTEND>20261031
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261030120000[-3:BRT]<TRNAMT>-87.35<FITID>A1<MEMO>SUPERMERCADO CONDOR</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261005<TRNAMT>5200.00<FITID>A2<MEMO>PAGTO SALARIO</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261006<TRNAMT>-55.90<FITID>A3<NAME>NETFLIX.COM</STMTTRN>
<STMTTRN><TRNTYPE>OTHER<DTPOSTED>20261007<TRNAMT>0.00<FITID>A4<MEMO>ZERADO</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>3456.78<DTASOF>20261031</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

const OFX_XML = `<?xml version="1.0" encoding="UTF-8"?><?OFX OFXHEADER="200" VERSION="220"?>
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261012</DTPOSTED><TRNAMT>-12.50</TRNAMT><FITID>X9</FITID><MEMO>Padaria &amp; Café</MEMO></STMTTRN>
</BANKTRANLIST><LEDGERBAL><BALAMT>-10.00</BALAMT><DTASOF>20261031</DTASOF></LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe("valores e datas", () => {
  it("lê formatos brasileiros e internacionais", () => {
    expect(parseAmount("1.234,56")).toBe(123456);
    expect(parseAmount("-87,35")).toBe(-8735);
    expect(parseAmount("R$ 12,00")).toBe(1200);
    expect(parseAmount("(12,00)")).toBe(-1200);
    expect(parseAmount("-87.35")).toBe(-8735);
    expect(parseAmount("1,234.56")).toBe(123456);
    expect(parseAmount("1.234")).toBe(123400);
    expect(parseAmount("1.234", true)).toBe(123);
    expect(parseAmount("abc")).toBeNull();
  });
  it("lê datas", () => {
    expect(parseDate("30/10/2026")).toBe("2026-10-30");
    expect(parseDate("5/1/26")).toBe("2026-01-05");
    expect(parseDate("2026-10-30")).toBe("2026-10-30");
    expect(parseDate("20261030120000[-3:BRT]")).toBe("2026-10-30");
    expect(parseDate("31/02/2026")).toBeNull();
  });
});

describe("OFX", () => {
  it("lê OFX SGML de banco brasileiro", () => {
    const s = parseOfx(OFX_SGML);
    expect(s.rows).toHaveLength(3);
    expect(s.rows[0]).toEqual({ key: "fA1", date: "2026-10-30", description: "SUPERMERCADO CONDOR", amountCents: -8735 });
    expect(s.rows[1]!.amountCents).toBe(520000);
    expect(s.rows[2]!.description).toBe("NETFLIX.COM");
    expect(s.balanceCents).toBe(345678);
    expect(s.balanceDate).toBe("2026-10-31");
    expect(s.accountHint).toBe("12345-6");
  });
  it("lê OFX em XML", () => {
    const s = parseStatement(OFX_XML, "extrato.ofx");
    expect(s.rows[0]).toMatchObject({ key: "fX9", description: "Padaria & Café", amountCents: -1250 });
    expect(s.balanceCents).toBe(-1000);
  });
  it("decodifica Windows-1252", () => {
    const latin = new Uint8Array([0x43, 0x61, 0x66, 0xe9]); // "Café" em 1252
    expect(decodeStatement(latin.buffer)).toBe("Café");
    expect(decodeStatement(new TextEncoder().encode("Café").buffer as ArrayBuffer)).toBe("Café");
  });
  it("recusa arquivo sem lançamentos", () => {
    expect(() => parseOfx("<OFX></OFX>")).toThrow(/Não encontrei/);
  });
});

describe("CSV", () => {
  it("lê extrato da conta Nubank", () => {
    const s = parseCsv(`Data,Valor,Identificador,Descrição
30/10/2026,-87.35,abc-1,Compra no débito - Mercado Condor
29/10/2026,200.00,abc-2,Transferência recebida pelo Pix - MARIA`);
    expect(s.rows).toEqual([
      { key: "cabc-1", date: "2026-10-30", description: "Compra no débito - Mercado Condor", amountCents: -8735 },
      { key: "cabc-2", date: "2026-10-29", description: "Transferência recebida pelo Pix - MARIA", amountCents: 20000 },
    ]);
  });
  it("lê fatura Nubank (valores positivos) e gera chaves estáveis para compras repetidas", () => {
    const txt = `date,title,amount
2026-10-20,Uber,15.90
2026-10-20,Uber,15.90
2026-10-21,Pagamento recebido,-300.00`;
    const a = parseCsv(txt);
    const b = parseCsv(txt);
    expect(a.rows).toHaveLength(3);
    expect(a.rows[0]!.key).not.toBe(a.rows[1]!.key);
    expect(a.rows.map((r) => r.key)).toEqual(b.rows.map((r) => r.key));
    expect(a.rows[0]!.amountCents).toBe(1590);
  });
  it("lê CSV com ponto e vírgula, linhas antes do cabeçalho, aspas e saldo", () => {
    const s = parseCsv(`Extrato conta corrente
Agência 1234;Conta 5678
Data Lançamento;Histórico;Valor (R$);Saldo (R$)
01/10/2026;SALDO ANTERIOR;;1.000,00
02/10/2026;"PIX ENVIADO; JOAO";-1.234,56;-234,56
03/10/2026;COPEL DISTRIBUICAO;-210,00;-444,56`);
    expect(s.rows).toHaveLength(2);
    expect(s.rows[0]).toMatchObject({ description: "PIX ENVIADO; JOAO", amountCents: -123456 });
  });
  it("lê colunas separadas de entrada e saída", () => {
    const s = parseCsv(`Data;Descrição;Entrada;Saída
02/10/2026;Salário;5.000,00;
03/10/2026;Aluguel;;1.800,00`);
    expect(s.rows.map((r) => r.amountCents)).toEqual([500000, -180000]);
  });
  it("explica quando não reconhece as colunas", () => {
    expect(() => parseCsv("a,b\n1,2")).toThrow(/data e uma de valor/);
  });
});

describe("categoria sugerida", () => {
  it("sugere pelas palavras do extrato", () => {
    expect(suggestStatementCategory("SUPERMERCADO CONDOR", "despesa")).toBe("Mercado");
    expect(suggestStatementCategory("MERCADOLIVRE*LOJA", "despesa")).toBe("Compras online");
    expect(suggestStatementCategory("Pix Mercado Pago", "despesa")).toBe("Outras");
    expect(suggestStatementCategory("NETFLIX.COM", "despesa")).toBe("Assinaturas");
    expect(suggestStatementCategory("COPEL DISTRIBUICAO", "despesa")).toBe("Contas");
    expect(suggestStatementCategory("PAGTO SALARIO", "receita")).toBe("Salário");
    expect(suggestStatementCategory("Pix recebido", "receita")).toBe("Outras receitas");
  });
});

describe("extrato com sinal trocado", () => {
  const rows = [
    { date: "2026-10-28", description: "SUPERMERCADOS BAVARESC PARANAGUA BRA. Cartão 5456", amountCents: 10608 },
    { date: "2026-10-28", description: "Pix recebido de NATHALIA", amountCents: -2000 },
    { date: "2026-10-27", description: "TRANSF ENVIADA PIX", amountCents: 3700 },
    { date: "2026-10-26", description: "MORIFARMA PARANAGUA BRA. Cartão 5456", amountCents: 8298 },
  ];
  it("percebe pelo que já veio do banco e pelas palavras", () => {
    expect(looksInverted(rows, [{ date: "2026-10-28", amountCents: 10608, type: "despesa" }])).toBe(true);
    expect(looksInverted(rows.map((r) => ({ ...r, amountCents: -r.amountCents })))).toBe(false);
  });
  it("limpa o sufixo do cartão", () => {
    expect(cleanMerchantName("SUPERMERCADOS BAVARESC PARANAGUA BRA. Cartão 5456")).toBe("SUPERMERCADOS BAVARESC PARANAGUA");
  });
});
