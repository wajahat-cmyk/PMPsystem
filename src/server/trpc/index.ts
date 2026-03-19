import { router } from "./trpc";
import { overviewRouter } from "./routers/overview";
import { productsRouter } from "./routers/products";
import { credentialsRouter } from "./routers/credentials";
import { syncRouter } from "./routers/sync";
import { keywordsRouter } from "./routers/keywords";
import { activityRouter } from "./routers/activity";
import { commentsRouter } from "./routers/comments";
import { csvImportRouter } from "./routers/csv-import";
import { syntaxRouter } from "./routers/syntax";
import { rootsRouter } from "./routers/roots";
import { actionPlanRouter } from "./routers/action-plan";
import { inventoryRouter } from "./routers/inventory";

export const appRouter = router({
  overview: overviewRouter,
  products: productsRouter,
  credentials: credentialsRouter,
  sync: syncRouter,
  keywords: keywordsRouter,
  activity: activityRouter,
  comments: commentsRouter,
  csvImport: csvImportRouter,
  syntax: syntaxRouter,
  roots: rootsRouter,
  actionPlan: actionPlanRouter,
  inventory: inventoryRouter,
});

export type AppRouter = typeof appRouter;
