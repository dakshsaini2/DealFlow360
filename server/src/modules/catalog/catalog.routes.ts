import { Router } from "express";
import { requireAuth } from "../../common/middleware/auth.middleware.js";
import * as catalogController from "./catalog.controller.js";

export const catalogRouter = Router();

catalogRouter.use(requireAuth);

catalogRouter.get("/categories", catalogController.listCategories);

/**
 * The pricing engine. POST rather than GET because the quote builder resolves
 * a whole cart at once, and a line array does not belong in a query string.
 */
catalogRouter.post("/pricing/resolve", catalogController.resolvePrice);

catalogRouter.get("/products", catalogController.listProducts);
catalogRouter.get("/products/:id", catalogController.getProduct);
