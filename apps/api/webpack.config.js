const path = require('path');

/**
 * Nest webpack defaults resolve node_modules from the importing package.
 * Shared libs under ../../libs need the API app's node_modules on the path.
 */
module.exports = function (options) {
  return {
    ...options,
    resolve: {
      ...options.resolve,
      modules: [
        path.resolve(__dirname, 'node_modules'),
        path.resolve(__dirname, '../../node_modules'),
        'node_modules',
      ],
      alias: {
        ...(options.resolve && options.resolve.alias),
        '@app/database': path.resolve(__dirname, '../../libs/database/src'),
        '@app/queue': path.resolve(__dirname, '../../libs/queue/src'),
        '@app/cloud-provider': path.resolve(__dirname, '../../libs/cloud-provider/src'),
        '@app/observability': path.resolve(__dirname, '../../libs/observability/src'),
        '@app/common': path.resolve(__dirname, '../../libs/common/src'),
      },
    },
  };
};
