import { FastifyInstance } from 'fastify';
import { controller } from './controller.js';

export async function routes(app: FastifyInstance) {
    // List classes (all authenticated institution members)
    app.get('/', {
        preHandler: [app.authenticate, app.rbac({ roles: ['main_admin', 'school_admin', 'teacher'], requireInstitution: false })],
    }, controller.list);

    // Get class by ID
    app.get('/:id', {
        preHandler: [app.authenticate, app.rbac({ roles: ['main_admin', 'school_admin', 'teacher'], requireInstitution: false })],
    }, controller.getOne);

    // Create class (school_admin or main_admin)
    app.post('/', {
        preHandler: [app.authenticate, app.rbac({ roles: ['main_admin', 'school_admin'] })],
    }, controller.create);

    // Update class
    app.patch('/:id', {
        preHandler: [app.authenticate, app.rbac({ roles: ['main_admin', 'school_admin'] })],
    }, controller.update);

    // Set the curriculum v2 node the class teaches (and each stream's code): its students' main learning goal.
    app.put('/:id/curriculum', {
        preHandler: [app.authenticate, app.rbac({ roles: ['main_admin', 'school_admin'] })],
    }, controller.setCurriculum);

    // Delete class
    app.delete('/:id', {
        preHandler: [app.authenticate, app.rbac({ roles: ['main_admin', 'school_admin'] })],
    }, controller.delete);
}
