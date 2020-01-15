#!/usr/bin/env node 
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const events_1 = require("events");
const path_1 = __importDefault(require("path"));
const ts_morph_1 = require("ts-morph");
const utils_1 = require("../lib/utils");
const debug_1 = __importDefault(require("debug"));
const debug = debug_1.default('FLY:TS_HELPER');
const CWD = process.cwd();
const dir = path_1.default.resolve(CWD, 'src/**/*');
const config = {
    root: CWD,
    files: path_1.default.resolve(CWD, 'src/**/*'),
    tsconfig: path_1.default.join(CWD, 'tsconfig.json'),
};
const FLY_FNS = {
    FlyFn0: ['main'],
    FlyFn1: ['before', 'main'],
    FlyFn2: ['main', 'after'],
    FlyFn3: ['before', 'main', 'after']
};
function firstLowerCase(name) {
    return name[0].toLowerCase() + name.slice(1);
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
function resolveModule(importFileName, exportFileName) {
    if (importFileName.startsWith(exportFileName)) {
        return;
    }
    exportFileName = stripExtension(exportFileName);
    if (!exportFileName.includes('/')) {
        return exportFileName;
    }
    const pos = exportFileName.indexOf('@types/');
    if (pos !== -1) {
        exportFileName = exportFileName.slice(pos + 7);
        if (exportFileName.endsWith('/index')) {
            exportFileName = exportFileName.slice(0, -6);
        }
        return exportFileName;
    }
    return path_1.default.relative(path_1.default.dirname(importFileName), exportFileName);
}
function stripExtension(fileName) {
    return fileName.endsWith('.d.ts')
        ? fileName.slice(0, -5)
        : fileName.endsWith('.ts')
            ? fileName.slice(0, -3)
            : fileName;
}
const typeRegImportGlobal = /import\(\"([0-9a-zA-Z_\-\/@]+)+\"\)\.([0-9a-zA-Z_]+)/g;
const typeRegImport = /import\(\"([0-9a-zA-Z_\-\/@]+)+\"\)\.([0-9a-zA-Z_]+)/;
function parseTypeStringForImport(typeStr) {
    debug('parse type ', typeStr);
    let results = new Array();
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
const typeRegPromise = /Promise<(.+)>/;
function removePromise(typeStr) {
    const ret2 = typeStr.match(typeRegPromise);
    if (ret2) {
        return ret2[1];
    }
    return typeStr;
}
const typeRegRemoveImport = /import\(\"([0-9a-zA-Z_\-\/@]+)+\"\)\./g;
function removeImportPath(typeStr) {
    return typeStr.replace(typeRegRemoveImport, '');
}
function parseReturnTypeString(typeStr) {
    const typeStr2 = removePromise(typeStr);
    return removeImportPath(typeStr2);
}
module.exports = class FlyProjectMonitor extends events_1.EventEmitter {
    // operator: Operator
    constructor() {
        super();
        this.project = new ts_morph_1.Project({
            tsConfigFilePath: config.tsconfig
        });
        debug('config', config);
        this.project.addSourceFilesAtPaths([config.files]);
        this.project.resolveSourceFileDependencies();
        this.on('change', this.updateFn)
            .on('unlink', this.unlinkFn);
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
        const { deps, typeAliasType, typeAliasName, isFlyFn } = this.updateMatchedFlyInterface(updatedFile);
        if (!isFlyFn) {
            return;
        }
        const classEntry = this.parseUpdatedFile(updatedFile);
        debug(classEntry);
        if (classEntry) {
            this.addFlyModuleDeclaration(updatedFile, classEntry, typeAliasName, typeAliasType);
            const curFile = updatedFile.getFilePath();
            for (let { path, type } of deps) {
                this.addImport(updatedFile, path, type);
            }
            this.project.emit();
        }
        this.project.saveSync();
    }
    updateMatchedFlyInterface(sourceFile) {
        const klass = sourceFile.getClasses().find(cls => cls.isExported());
        if (!klass)
            return {};
        const methods = klass.getInstanceMethods().map(m => m.getName()).filter(name => ['main', 'before', 'after'].includes(name));
        if (!methods.includes('main')) {
            return {};
        }
        let interfaceName = Object.entries(FLY_FNS).find(([, flyMethods]) => isArrayEqual(methods, flyMethods));
        if (!interfaceName) {
            console.error(`需要补全 FlyFn { ${methods.join(', ')} }`);
            return {};
        }
        if (klass.getImplements().length > 0) {
            klass.removeImplements(0);
        }
        const [name, flyMethods] = interfaceName;
        const { deps, genericParams } = flyMethods.reduce((prev, name) => {
            const method = klass.getInstanceMethod(name);
            if (name === 'before') {
                prev.deps.push(...parseTypeStringForImport(method.getParameters()[0].getType().getText()));
                prev.genericParams.push(method.getParameters()[0].getChildAtIndex(2).getText());
            }
            else if (name === 'main') {
                prev.deps.push(...parseTypeStringForImport(method.getParameters()[0].getType().getText()));
                prev.deps.push(...parseTypeStringForImport(method.getReturnType().getText()));
                prev.genericParams.push(method.getParameters()[0].getChildAtIndex(2).getText());
                prev.genericParams.push(parseReturnTypeString(method.getReturnType().getTypeArguments()[0].getText()));
            }
            else if (name === 'after') {
                prev.deps.push(...parseTypeStringForImport(method.getReturnType().getText()));
                prev.genericParams.push(parseReturnTypeString(method.getReturnType().getTypeArguments()[0].getText()));
            }
            return prev;
        }, { deps: new Array(), genericParams: new Array() });
        const implName = 'I' + klass.getName();
        klass.addImplements(implName);
        this.addImport(sourceFile, 'fly', implName);
        return { deps, typeAliasName: implName, typeAliasType: `${name}<${genericParams.join(', ')}>`, isFlyFn: true };
    }
    addImport(sourceFile, modulePath, namedImport) {
        const moduleSpecifier = resolveModule(sourceFile.getFilePath(), modulePath);
        if (!moduleSpecifier) {
            return;
        }
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
    addFlyModuleDeclaration(sourceFile, classEntry, typeAliasName, typeAliasType) {
        let flyModule = sourceFile.getNamespace(n => { var _a; return ((_a = n.getName()) === null || _a === void 0 ? void 0 : _a.replace(/'/g, '')) === 'fly'; });
        if (flyModule) {
            flyModule.remove();
        }
        flyModule = sourceFile.addNamespace({ name: "'fly'" });
        flyModule.setDeclarationKind(ts_morph_1.NamespaceDeclarationKind.Module);
        flyModule.setHasDeclareKeyword(true);
        // add fly fn to Context
        const context = flyModule.addInterface({ name: 'Context' });
        const fn = context.getProperty(classEntry.name);
        if (fn) {
            fn.remove();
        }
        debug('class entry', classEntry);
        const name = utils_1.camelcase(path_1.default.basename(sourceFile.getFilePath(), '.ts'));
        context.addProperty({
            name,
            type: `Operator<${classEntry.eventType.text}, ${classEntry.returnType.text}>`
        });
        // add type alias for fly fn interface
        flyModule.addTypeAlias({
            name: typeAliasName,
            type: typeAliasType
        });
    }
    parseUpdatedFile(file) {
        const klass = file.getClasses().find(cls => cls.isExported());
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