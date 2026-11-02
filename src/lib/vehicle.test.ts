import { describe, expect, it } from "vitest";
import { averageKmPerLiter, consumption, costPerKm, currentOdometer, fillMath, flexAdvice, kmDriven, kmPerMonth, monthly, reminderStatus, type Vehicle, type VehicleLog } from "./vehicle";

const v: Vehicle = { id: "v", scope: "pessoal", name: "Onix", plate: null, fuel: "flex", initialOdometer: 10000 };
let n = 0;
const fill = (date: string, odometer: number, liters: number, totalCents: number, fullTank = true, fuel: VehicleLog["fuel"] = "gasolina"): VehicleLog => ({
  id: String(++n), vehicleId: "v", kind: "abastecimento", date, odometer, liters, pricePerLiterCents: Math.round(totalCents / liters), fuel, fullTank,
  subtype: null, description: null, place: null, amountCents: totalCents, transactionId: null,
});
const service = (date: string, odometer: number | null, amountCents: number): VehicleLog => ({
  id: String(++n), vehicleId: "v", kind: "servico", date, odometer, liters: null, pricePerLiterCents: null, fuel: null, fullTank: true,
  subtype: "Troca de óleo", description: null, place: null, amountCents, transactionId: null,
});

describe("consumo pelo método do tanque cheio", () => {
  it("calcula km/L entre dois tanques cheios e soma os parciais do meio", () => {
    const logs = [
      fill("2026-09-01", 10000, 40, 24000),
      fill("2026-09-10", 10200, 15, 9000, false),
      fill("2026-09-20", 10480, 25, 15000),
      fill("2026-10-05", 10880, 32, 19200, true, "etanol"),
    ];
    const pts = consumption(logs);
    expect(pts).toHaveLength(2);
    expect(pts[0]!.km).toBe(480);
    expect(pts[0]!.liters).toBe(40);
    expect(pts[0]!.kmPerLiter).toBe(12);
    expect(pts[1]!.kmPerLiter).toBe(12.5);
    expect(averageKmPerLiter(pts)).toBeCloseTo(880 / 72);
    expect(averageKmPerLiter(pts, "etanol")).toBe(12.5);
  });
  it("ignora o primeiro abastecimento e parciais antes do primeiro cheio", () => {
    expect(consumption([fill("2026-09-01", 100, 10, 6000, false), fill("2026-09-02", 200, 40, 24000)])).toEqual([]);
  });
});

describe("custos e quilometragem", () => {
  const logs = [fill("2026-09-01", 10000, 40, 24000), fill("2026-10-01", 11000, 40, 24000), service("2026-10-02", 11010, 30000)];
  it("hodômetro atual, km rodados e custo por km", () => {
    expect(currentOdometer(v, logs)).toBe(11010);
    expect(kmDriven(v, logs)).toBe(1010);
    expect(costPerKm(v, logs)).toBeCloseTo(78000 / 1010);
  });
  it("custo por km usa o menor registro quando o hodômetro inicial é zero", () => {
    expect(kmDriven({ ...v, initialOdometer: 0 }, logs)).toBe(1010);
  });
  it("monta os meses com combustível, serviços e km", () => {
    const rows = monthly(logs, "2026-10", 3);
    expect(rows.map((r) => r.ym)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(rows[2]).toEqual({ ym: "2026-10", combustivel: 24000, servicos: 30000, despesas: 0, km: 1010 });
    expect(rows[1]!.km).toBeNull();
  });
  it("média de km por mês", () => {
    expect(kmPerMonth(logs)).toBeCloseTo((1010 / 31) * 30.44);
    expect(kmPerMonth([logs[0]!])).toBeNull();
  });
});

describe("etanol ou gasolina", () => {
  it("regra dos 70%", () => {
    expect(flexAdvice(399, 599)!.best).toBe("etanol");
    expect(flexAdvice(449, 599)!.best).toBe("gasolina");
  });
  it("usa a média real do carro quando existe", () => {
    const a = flexAdvice(449, 599, 9, 12.5)!;
    expect(a.byOwnAverage).toBe(true);
    expect(a.best).toBe("gasolina");
    expect(flexAdvice(0, 599)).toBeNull();
  });
});

describe("lembretes", () => {
  const r = { id: "r", vehicleId: "v", title: "Troca de óleo", everyKm: 10000, everyMonths: 12, lastKm: 20000, lastDate: "2026-01-15" };
  it("está em dia, perto ou vencido por km ou por data", () => {
    expect(reminderStatus(r, 25000, "2026-06-01")).toMatchObject({ state: "ok", nextKm: 30000, kmLeft: 5000, nextDate: "2027-01-15" });
    expect(reminderStatus(r, 29600, "2026-06-01").state).toBe("breve");
    expect(reminderStatus(r, 30100, "2026-06-01").state).toBe("vencido");
    expect(reminderStatus(r, 21000, "2027-01-10").state).toBe("breve");
    expect(reminderStatus(r, 21000, "2027-01-20").state).toBe("vencido");
  });
  it("lida com fim de mês", () => {
    expect(reminderStatus({ ...r, everyKm: null, lastDate: "2026-01-31", everyMonths: 1 }, 0, "2026-02-01").nextDate).toBe("2026-02-28");
  });
});

describe("conta do abastecimento", () => {
  it("completa o terceiro valor", () => {
    expect(fillMath({ liters: 40, priceCents: 599 }).totalCents).toBe(23960);
    expect(fillMath({ liters: 40, totalCents: 24000 }).priceCents).toBe(600);
    expect(fillMath({ priceCents: 600, totalCents: 24000 }).liters).toBe(40);
  });
});
