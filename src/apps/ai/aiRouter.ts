import { Router } from 'express';
import { renderIndex, postAsk } from './aiController';

const aiRouter = Router();

aiRouter.get('/', (req, res, next) => {
  renderIndex(req, res, next);
});

aiRouter.post('/ask', (req, res, next) => {
  void postAsk(req, res, next);
});

export default aiRouter;