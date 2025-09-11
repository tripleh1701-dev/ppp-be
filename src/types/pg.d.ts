declare module 'pg' {
    export class Pool {
        constructor(config?: any);
        connect(): Promise<any>;
        on(event: string, callback: (client: any, ...args: any[]) => void): void;
    }
}
