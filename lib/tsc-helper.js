#!/usr/bin/env node 
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const events_1 = require("events");
const path_1 = __importDefault(require("path"));
const ts_morph_1 = require("ts-morph");
const debug_1 = __importDefault(require("debug"));
const debug = debug_1.default('FLY:TS_HELPER');
const CWD = process.cwd();
const dir = path_1.default.resolve(CWD, 'src/**/*');
const config = {
    root: CWD,
    files: path_1.default.resolve(CWD, 'src/**/*'),
    autoGenDef: path_1.default.join(CWD, 'src/types/auto-gen.d.ts'),
    tsconfig: path_1.default.join(CWD, 'tsconfig.json'),
    flyFn: {
        beforeOps: ['before'],
        afterOps: ['after'],
        events: ['http', 'command', 'cron']
    }
};
function firstLowerCase(name) {
    return name[0].toLowerCase() + name.slice(1);
}
function stripExtension(fileName) {
    return fileName.endsWith('.d.ts')
        ? fileName.slice(0, -5)
        : fileName.endsWith('.ts')
            ? fileName.slice(0, -3)
            : fileName;
}
function resolveModule(importFileName, exportFileName) {
    if (!exportFileName.includes('/')) {
        return exportFileName;
    }
    return path_1.default.relative(path_1.default.dirname(importFileName), stripExtension(exportFileName));
}
const FlyFnPrefix = 'FlyFn';
var OpIdx;
(function (OpIdx) {
    OpIdx[OpIdx["beforeEvent"] = 1] = "beforeEvent";
    OpIdx[OpIdx["before"] = 2] = "before";
    OpIdx[OpIdx["main"] = 3] = "main";
    OpIdx[OpIdx["after"] = 4] = "after";
    OpIdx[OpIdx["afterEvent"] = 5] = "afterEvent";
    // catch = 6, // R6
    // catchEvent = 7, // R7
})(OpIdx || (OpIdx = {}));
class Operator {
    constructor(flyModule) {
        this.flyModule = flyModule;
    }
    updateMatchedFlyInterface(sourceFile) {
        var _a;
        const klass = sourceFile.getClasses().find(cls => cls.isDefaultExport());
        if (!klass)
            return;
        const methods = klass.getInstanceMethods().map(m => m.getName());
        if (!methods.includes('main')) {
            return;
        }
        if (!this.interfaces || this.interfaces.length) {
            this.loadFns();
        }
        debug('interfaces', this.interfaces);
        let interfaceOption = this.interfaces.find(intf => isArrayEqual(extractFlyOps(methods), intf.ops.map(op => op.name).filter(n => n !== 'extends')));
        let name = (_a = interfaceOption) === null || _a === void 0 ? void 0 : _a.name;
        if (!name) {
            name = FlyFnPrefix + this.interfaces.length;
            interfaceOption = { name, ops: this.genOps(methods, name) };
            this.addFlyFnInterface(interfaceOption);
        }
        if (klass.getImplements().length) {
            klass.removeImplements(0);
        }
        const genericTypes = interfaceOption.ops.reduce((prev, op) => {
            debug('op', op);
            const method = klass.getInstanceMethod(op.name);
            if (op.idx < OpIdx.main) {
                prev.push(method.getParameters()[0].getChildAtIndex(2).getText());
            }
            else if (op.idx === OpIdx.main) {
                prev.push(method.getParameters()[0].getChildAtIndex(2).getText());
                prev.push(parseReturnTypeString(method.getReturnType().getTypeArguments()[0].getText()));
            }
            else {
                prev.push(parseReturnTypeString(method.getReturnType().getTypeArguments()[0].getText()));
            }
            return prev;
        }, new Array());
        this.addImport(sourceFile, 'fly', name);
        klass.addImplements(`${name}<${genericTypes.join(', ')}>`);
    }
    addImport(sourceFile, moduleSpecifier, namedImport) {
        let importDeclaration = sourceFile.getImportDeclaration(impt => impt.getModuleSpecifier().getLiteralValue() === moduleSpecifier);
        if (!importDeclaration) {
            sourceFile.addImportDeclaration({ namedImports: [namedImport], moduleSpecifier });
        }
        else {
            const oldNamedImports = importDeclaration.getNamedImports().map(imptSpec => imptSpec.getText());
            if (!oldNamedImports.includes(namedImport)) {
                importDeclaration.addNamedImport(namedImport);
            }
        }
    }
    loadFns() {
        this.interfaces = this.flyModule.getInterfaces()
            .filter(item => item.getName().startsWith('FlyFn'))
            .map(item => {
            const ops = this.genOps(item.getProperties().map(m => m.getName()), item.getName());
            ops.forEach(op => {
                debug('op', op);
            });
            return { ops, name: item.getName() };
        });
    }
    genOps(methods, interfaceName) {
        return methods
            .filter(name => name == 'main' || name.startsWith('before') || name.startsWith('after'))
            .map(name => {
            let idx;
            if (name === 'main') {
                idx = OpIdx.main;
            }
            else if (name === 'before') {
                idx = OpIdx.before;
            }
            else if (name.startsWith('before')) {
                idx = OpIdx.beforeEvent;
            }
            else if (name === 'after') {
                idx = OpIdx.after;
            }
            else if (name.startsWith('after')) {
                idx = OpIdx.afterEvent;
                // } else if (name === 'catch') {
                //   idx = OpIdx.catch
                // } else if (name.startsWith('catch')) {
                //   idx = OpIdx.catchEvent
            }
            return { name, idx };
        })
            .sort((op1, op2) => op1.name.localeCompare(op2.name))
            .sort((op1, op2) => op1.idx - op2.idx);
    }
    addFlyFnInterface(intf) {
        debug('add fly interface: ', intf);
        this.interfaces.push(intf);
        debug('interfaces 2', this.interfaces);
        const { ops, name } = intf;
        const interfaceDeclaration = this.flyModule.addInterface({ name });
        const interfaceOption = ops.reduce((prev, op) => {
            switch (op.idx) {
                case OpIdx.beforeEvent:
                    const beforeEventIdx = countArray(prev.methods, (m) => {
                        return m.eventType.startsWith(`E${OpIdx.beforeEvent}`);
                    });
                    prev.typeParams.push(`E${op.idx}${beforeEventIdx}`);
                    prev.methods.push({
                        name: op.name,
                        eventType: `E${op.idx}${beforeEventIdx}`,
                        returnType: `E${OpIdx.main}`
                    });
                    break;
                case OpIdx.before:
                    const event = 'E' + OpIdx.before;
                    prev.typeParams.push(event);
                    prev.methods = updateArray(prev.methods, (m) => {
                        return m.eventType.startsWith('E' + OpIdx.beforeEvent);
                    }, (m) => {
                        m.returnType = event;
                        return m;
                    });
                    prev.methods.push({
                        name: op.name,
                        eventType: `E${OpIdx.before}`,
                        returnType: `E${OpIdx.main}`
                    });
                    break;
                case OpIdx.main:
                    prev.typeParams.push('E' + op.idx, 'R' + op.idx);
                    prev.methods.push({
                        name: op.name,
                        eventType: `E${OpIdx.main}`,
                        returnType: `R${OpIdx.main}`
                    });
                    break;
                case OpIdx.after:
                    prev.typeParams.push('R' + op.idx);
                    prev.methods.push({
                        name: op.name,
                        eventType: `R${OpIdx.main}`,
                        returnType: `R${OpIdx.after}`
                    });
                    break;
                case OpIdx.afterEvent:
                    const afterEventIdx = countArray(prev.methods, (m) => {
                        return m.returnType.startsWith(`R${OpIdx.afterEvent}`);
                    });
                    prev.typeParams.push(`R${op.idx}${afterEventIdx}`);
                    const afterDefined = !!prev.methods.find(m => m.returnType === `R${OpIdx.after}`);
                    prev.methods.push({
                        name: op.name,
                        eventType: `R${afterDefined ? OpIdx.after : OpIdx.main}`,
                        returnType: `R${OpIdx.afterEvent}${afterEventIdx}`
                    });
                    break;
            }
            return prev;
        }, {
            typeParams: new Array(),
            methods: new Array()
        });
        interfaceDeclaration.addTypeParameters(interfaceOption.typeParams);
        interfaceDeclaration.addProperty({ name: 'extends', type: 'keyof Context', hasQuestionToken: true });
        interfaceDeclaration.addProperties(interfaceOption.methods.map(op => ({
            name: op.name,
            type: `Operator<${op.eventType}, ${op.returnType}>`
        })));
    }
}
function extractFlyOps(methods) {
    return methods.filter(m => m === 'main' || m.startsWith('before') || m.startsWith('after'));
}
function isArrayEqual(arr1, arr2) {
    debug({ arr1, arr2 });
    if (arr1.length !== arr2.length)
        return false;
    for (let item of arr1) {
        if (!arr2.includes(item)) {
            return false;
        }
    }
    return true;
}
function updateArray(arr, match, modify) {
    for (let i in arr) {
        if (match(arr[i])) {
            arr[i] = modify(arr[i]);
        }
    }
    return arr;
}
function countArray(arr, match) {
    let c = 0;
    for (let i = 0; i < arr.length; i++) {
        if (match(arr[i])) {
            c++;
        }
    }
    return c;
}
const typeRegImportGlobal = /import\(\"([0-9a-zA-Z_\-\/]+)+\"\)\.([0-9a-zA-Z_]+)/g;
const typeRegImport = /import\(\"([0-9a-zA-Z_\-\/]+)+\"\)\.([0-9a-zA-Z_]+)/;
const typeRegPromise = /Promise<(.+)>/;
function parseTypeStringForImport(typeStr) {
    debug('parse type ', typeStr);
    let results = [];
    const rets = typeStr.match(typeRegImportGlobal);
    if (rets) {
        for (let ret of rets) {
            const [, path, type] = ret.match(typeRegImport);
            results.push({ path, type });
        }
    }
    debug('deps', results);
    return results;
}
function parseReturnTypeString(typeStr) {
    const ret2 = typeStr.match(typeRegPromise);
    if (ret2) {
        return ret2[1];
    }
    return typeStr;
}
module.exports = class FlyProjectMonitor extends events_1.EventEmitter {
    constructor() {
        super();
        this.project = new ts_morph_1.Project({
            tsConfigFilePath: config.tsconfig
        });
        debug('config', config);
        this.project.addSourceFilesAtPaths([config.files]);
        this.project.resolveSourceFileDependencies();
        const flyModule = this.getFlyModule();
        this.operator = new Operator(flyModule);
        this.on('change', this.updateFn)
            .on('unlink', this.unlinkFn);
    }
    getFlyModule() {
        const autoGen = this.project.getSourceFile(config.autoGenDef);
        return autoGen.getNamespace(n => {
            var _a;
            return ((_a = n.getName()) === null || _a === void 0 ? void 0 : _a.replace(/'/g, '')) === 'fly';
        });
    }
    updateFn(fileName) {
        debug('will update fn: ', fileName);
        this.project.addSourceFileAtPath(fileName);
        const updatedFile = this.project.getSourceFile(fileName);
        const result = updatedFile.refreshFromFileSystemSync();
        debug('result after refresh', result);
        if (!updatedFile) {
            return;
        }
        this.operator.updateMatchedFlyInterface(updatedFile);
        const classEntry = this.parseUpdatedFile(updatedFile);
        debug(classEntry);
        if (classEntry) {
            this.addContext(classEntry);
            this.project.emit();
        }
        this.project.saveSync();
    }
    addImport(moduleSpecifier, namedImport) {
        const autoGen = this.project.getSourceFile(config.autoGenDef);
        let importDeclaration = autoGen.getImportDeclaration(impt => impt.getModuleSpecifier().getLiteralValue() === moduleSpecifier);
        if (!importDeclaration) {
            autoGen.addImportDeclaration({ namedImports: [namedImport], moduleSpecifier });
        }
        else {
            const oldNamedImports = importDeclaration.getNamedImports().map(imptSpec => imptSpec.getText());
            if (!oldNamedImports.includes(namedImport)) {
                importDeclaration.addNamedImport(namedImport);
            }
        }
    }
    addContext(classEntry) {
        const flyModule = this.getFlyModule();
        const context = flyModule.getInterface('Context');
        flyModule.getImportDeclarations();
        if (classEntry.eventType.dependencies.length > 0) {
            for (let { type, path } of classEntry.eventType.dependencies) {
                const moduleSpecifier = resolveModule(config.autoGenDef, path);
                this.addImport(moduleSpecifier, type);
            }
        }
        if (classEntry.returnType.dependencies.length > 0) {
            for (let { type, path } of classEntry.returnType.dependencies) {
                this.addImport(resolveModule(config.autoGenDef, path), type);
            }
        }
        const fn = context.getProperty(classEntry.name);
        if (fn) {
            fn.remove();
        }
        debug('class entry', classEntry);
        context.addProperty({
            name: classEntry.name,
            type: `Operator<${classEntry.eventType.text}, ${classEntry.returnType.text}>`
        });
    }
    parseUpdatedFile(file) {
        const klass = file.getClasses().find(cls => cls.isDefaultExport());
        if (!klass || !klass.getInstanceMethod('main')) {
            // not fly fn
            debug(`${file.getFilePath()} not fly fn`);
            return;
        }
        const eventMethod = klass.getInstanceMethod('before') || klass.getInstanceMethod('main');
        const eventType = {
            text: eventMethod.getParameters()[0].getChildAtIndex(2).getText(),
            dependencies: parseTypeStringForImport(eventMethod.getParameters()[0].getType().getText())
        };
        const returnMethod = klass.getInstanceMethod('after') || klass.getInstanceMethod('main');
        const returnType = {
            text: parseReturnTypeString(returnMethod.getReturnType().getText()),
            dependencies: parseTypeStringForImport(returnMethod.getReturnType().getText())
        };
        return {
            filePath: file.getFilePath(),
            name: firstLowerCase(klass.getName()),
            eventType,
            returnType
        };
    }
    unlinkFn(fileName) {
    }
};
//# sourceMappingURL=tsc-helper.js.map