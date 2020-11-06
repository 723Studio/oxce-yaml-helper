export enum LogLevel {
    Debug = 0,
    Info = 1,
    Warn = 2,
    Error = 3
}

//export let logLevel: LogLevel = workspace.getConfiguration('oxcYamlHelper').get('debugLevel');
export const logLevel: LogLevel = LogLevel.Debug;

export class Logger {
    // eslint-disable-next-line @typescript-eslint/no-empty-function

    public constructor () {
        this.initLoggers();
    }

    private initLoggers() {
        if (logLevel <= LogLevel.Debug) {
            this.debug = console.info.bind(console, '[debug] ');
        }
        if (logLevel <= LogLevel.Info) {
            this.info = console.info.bind(console, '[info ] ');
        }
        if (logLevel <= LogLevel.Warn) {
            this.warn = console.warn.bind(console, '[warn] ');
        }
        if (logLevel <= LogLevel.Error) {
            this.error = console.error.bind(console, '[error] ');
        }
    }

    public debug(..._args: any[]): void { return; }
    public info(..._args: any[]): void { return; }
    public warn(..._args: any[]): void { return; }
    public error(..._args: any[]): void { return; }
}

export const logger = new Logger();
