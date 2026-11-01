import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";
import { AppError } from "../../utils/AppError.js";
import { checkout, changeStock, createProduct, updateProduct } from "./retail.service.js";
import { getProduct, getSale, listMovements, listProducts, listSales, retailDashboard } from "./retail.reads.js";
import { checkoutInput, createProductInput, movementQuery, productQuery, reportQuery, retailId, saleQuery, stockInput, updateProductInput } from "./retail.validation.js";
const parse = <T>(schema: z.ZodType<T>, data: unknown): T => {
  const result = schema.safeParse(data);
  if (!result.success) { const issue = result.error.issues[0]; throw new AppError(400, `${issue.path.join(".") || "Input"}: ${issue.message}`); }
  return result.data;
};
export const retailRouter = Router(); retailRouter.use(requireAuth);
const read = requirePermission("retail.read"), manage = [requireRole("ADMIN"), requirePermission("retail.manage")];
retailRouter.get("/products", read, async (req, res) => res.json({ success: true, ...await listProducts(req.staff!, parse(productQuery, req.query)) }));
retailRouter.get("/products/:id", read, async (req, res) => res.json({ success: true, ...await getProduct(req.staff!, parse(retailId, req.params.id)) }));
retailRouter.get("/products/:id/movements", ...manage, async (req, res) => res.json({ success: true, ...await listMovements(req.staff!, parse(retailId, req.params.id), parse(movementQuery, req.query)) }));
retailRouter.post("/products", ...manage, async (req, res) => res.status(201).json({ success: true, ...await createProduct(req.staff!, parse(createProductInput, req.body)) }));
retailRouter.put("/products/:id", ...manage, async (req, res) => res.json({ success: true, ...await updateProduct(req.staff!, parse(retailId, req.params.id), parse(updateProductInput, req.body)) }));
retailRouter.post("/products/:id/stock", ...manage, async (req, res) => { const result = await changeStock(req.staff!, parse(retailId, req.params.id), parse(stockInput, req.body)); res.status(result.replayed ? 200 : 201).json({ success: true, ...result }); });
retailRouter.post("/checkout", read, requirePermission("retail.checkout"), async (req, res) => { const result = await checkout(req.staff!, parse(checkoutInput, req.body)); res.status(result.replayed ? 200 : 201).json({ success: true, ...result }); });
retailRouter.get("/sales", requirePermission("retail.sales.read"), async (req, res) => res.json({ success: true, ...await listSales(req.staff!, parse(saleQuery, req.query)) }));
retailRouter.get("/sales/:id", requirePermission("retail.sales.read"), async (req, res) => res.json({ success: true, ...await getSale(req.staff!, parse(retailId, req.params.id)) }));
retailRouter.get("/dashboard", ...manage, async (req, res) => res.json({ success: true, ...await retailDashboard(req.staff!, parse(reportQuery, req.query)) }));
