"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const chokidar_1 = __importDefault(require("chokidar"));
const path_1 = __importDefault(require("path"));
const debug_1 = __importDefault(require("debug"));
const tsc_helper_1 = __importDefault(require("../lib/tsc-helper"));
const debug = debug_1.default('FLY:TS_HELPER');
class Helper {
    constructor() {
        this.cwd = process.cwd();
        this.extends = 'server';
        this.config = {
            command: 'tsc',
            name: 'tsc'
        };
        this.fileMap = new Map();
    }
    init() {
        const sourceFiles = path_1.default.join(this.cwd, 'src/**/*');
        this.watcher = chokidar_1.default.watch(sourceFiles, {
            cwd: this.cwd,
            ignored: ['**/*.js', '**/*.d.ts', '**/*.yml', '**/*.log', '**/*.js.map'],
            ignoreInitial: true
        });
    }
    run() {
        const monitor = new tsc_helper_1.default();
        const eventHandler = (evt, filePath) => {
            debug(evt, filePath);
            const now = Date.now();
            const key = `${evt}:${filePath}`;
            const lastUpdatedAt = this.fileMap.get(key);
            if (lastUpdatedAt && (now - lastUpdatedAt < 2000)) {
                return;
            }
            this.fileMap.set(key, now);
            monitor.emit(evt, filePath);
        };
        this.watcher.on('all', eventHandler);
        return true;
    }
}
exports.default = Helper;
//# sourceMappingURL=tsc.js.map