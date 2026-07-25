const path = require('path');

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
        '@app/common': path.resolve(__dirname, '../../libs/common/src'),
        '@api/resources': path.resolve(__dirname, '../api/src/modules/resources'),
        '@api/audit-logs': path.resolve(__dirname, '../api/src/modules/audit-logs'),
        '@api/cloud-accounts': path.resolve(__dirname, '../api/src/modules/cloud-accounts'),
      },
    },
  };
};
