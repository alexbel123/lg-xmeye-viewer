'use strict';
const Service = require('webos-service');
const { ViewerManager } = require('./lib/manager.cjs');
const manager = new ViewerManager();
const service = new Service('local.xmeye.viewer.service');
for (const method of manager.methods) {
  service.register(method, async message => {
    try { message.respond({ returnValue: true, ...(await manager[method](message.payload || {})) }); }
    catch (error) { message.respond({ returnValue: false, errorCode: Number(error.code) || -1, errorText: error.message || 'Не удалось выполнить запрос' }); }
  });
}
service.register('session', message => {
  message.respond({ returnValue: true, subscribed: Boolean(message.isSubscription) });
});
process.on('SIGTERM', () => manager.close().finally(() => process.exit(0)));
