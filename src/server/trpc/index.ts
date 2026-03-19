import { router } from "./trpc";
import { overviewRouter } from "./routers/overview";
import { productsRouter } from "./routers/products";
import { credentialsRouter } from "./routers/credentials";
import { syncRouter } from "./routers/sync";
import { keywordsRouter } from "./routers/keywords";
import { activityRouter } from "./routers/activity";
import { commentsRouter } from "./routers/comments";

export const appRouter = router({
  overview: overviewRouter,
  products: productsRouter,
  credentials: credentialsRouter,
  sync: syncRouter,
  keywords: keywordsRouter,
  activity: activityRouter,
  comments: commentsRouter,
});

export type AppRouter = typeof appRouter;
