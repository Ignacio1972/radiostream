function errorHandler(err, req, res, next) {
  console.error('Error:', err);

  if (err.message === 'TOKEN_EXPIRED') {
    return res.status(401).json({
      error: 'Token expired',
      message: 'Please refresh your authentication'
    });
  }

  if (err.response) {
    return res.status(err.response.status).json({
      error: 'API Error',
      message: err.response.data?.error?.message || err.message,
      status: err.response.status
    });
  }

  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
}

module.exports = errorHandler;
