export const registerExecutionBoundaryRoutes = (app, runtime) => {
  app.get('/api/execution-boundary/status', (_req, res) => {
    res.json(runtime.getStatus());
  });
};
