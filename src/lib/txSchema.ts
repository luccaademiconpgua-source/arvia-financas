import { z } from "zod";
import { shiftDays } from "./clock";

export const paymentValues = ["pix", "dinheiro", "debito", "credito"] as const;

/** Validação do formulário de lançamento. `today` entra por parâmetro para o teste ser estável. */
export function makeTxSchema(today: string) {
  return z
    .object({
      type: z.enum(["receita", "despesa", "reserva"]),
      amountCents: z.number().int("Informe um valor maior que zero.").positive("Informe um valor maior que zero."),
      description: z.string().trim().min(2, "Descreva com 2 a 80 caracteres.").max(80, "Descreva com 2 a 80 caracteres."),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida."),
      payment: z.enum(paymentValues),
      categoryId: z.string().optional(),
      accountId: z.string().optional(),
      cardId: z.string().optional(),
      goalId: z.string().optional(),
      essential: z.boolean().optional(),
    })
    .superRefine((v, ctx) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(v.date) && v.date > shiftDays(today, 1)) {
        ctx.addIssue({ code: "custom", path: ["date"], message: "A data pode ser no máximo amanhã." });
      }
      if (v.type === "reserva") {
        if (!v.goalId) ctx.addIssue({ code: "custom", path: ["goalId"], message: "Escolha a meta." });
        if (!v.accountId) ctx.addIssue({ code: "custom", path: ["accountId"], message: "Escolha a conta." });
      }
      if (v.payment === "credito" && !v.cardId) {
        ctx.addIssue({ code: "custom", path: ["cardId"], message: "Escolha o cartão." });
      }
      if (v.type !== "reserva" && v.payment !== "credito" && !v.accountId) {
        ctx.addIssue({ code: "custom", path: ["accountId"], message: "Escolha a conta." });
      }
    });
}
