import fs from 'fs';
import path from 'path';

interface TemplateDetails {
    enterprise: string;
    entity: string;
}

interface Template {
    id: string;
    name: string;
    description: string;
    details: TemplateDetails;
    deploymentType: 'Integration' | 'Extension';
    creationDate: string;
    status: 'Active' | 'Inactive';
}

export class TemplatesService {
    private templatesFile: string;

    constructor(storageDir?: string) {
        this.templatesFile = storageDir
            ? path.join(storageDir, 'templates.json')
            : path.join(__dirname, '../../data/templates.json');
        this.ensureTemplatesFileExists();
    }

    private ensureTemplatesFileExists() {
        const dir = path.dirname(this.templatesFile);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, {recursive: true});
        }
        if (!fs.existsSync(this.templatesFile)) {
            fs.writeFileSync(this.templatesFile, JSON.stringify([], null, 2));
        }
    }

    async list(): Promise<Template[]> {
        try {
            const data = await fs.promises.readFile(this.templatesFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error reading templates:', error);
            return [];
        }
    }

    async get(id: string): Promise<Template | null> {
        const templates = await this.list();
        return templates.find((t) => t.id === id) || null;
    }

    async create(template: Template): Promise<Template> {
        const templates = await this.list();
        templates.push(template);
        await fs.promises.writeFile(
            this.templatesFile,
            JSON.stringify(templates, null, 2),
        );
        return template;
    }

    async update(id: string, template: Template): Promise<Template | null> {
        const templates = await this.list();
        const index = templates.findIndex((t) => t.id === id);
        if (index === -1) return null;

        templates[index] = {...template, id};
        await fs.promises.writeFile(
            this.templatesFile,
            JSON.stringify(templates, null, 2),
        );
        return templates[index];
    }

    async remove(id: string): Promise<boolean> {
        const templates = await this.list();
        const filteredTemplates = templates.filter((t) => t.id !== id);
        if (filteredTemplates.length === templates.length) return false;

        await fs.promises.writeFile(
            this.templatesFile,
            JSON.stringify(filteredTemplates, null, 2),
        );
        return true;
    }
}

export const templatesService = new TemplatesService();
