#!/usr/bin/env node 
import { EventEmitter } from "events"
import path from 'path'
import { ts, Project, NamespaceDeclaration, SourceFile  } from 'ts-morph'
import Debug from 'debug'


const debug = Debug('FLY:TS_HELPER')
const CWD = process.cwd()

const dir = path.resolve(CWD, 'src/**/*')
const config = {
  root: CWD,
  files: path.resolve(CWD, 'src/**/*'),
  autoGenDef: path.join(CWD, 'src/@types/auto-gen.d.ts'),
  tsconfig: path.join(CWD, 'tsconfig.json'),
  flyFn: {
    beforeOps: [ 'before' ],
    afterOps: ['after' ],
    events: [ 'http', 'command', 'cron' ]
  }
}


interface ClassEntry {
  name?: string;
  fileName?: string;
  type?: string;
  constructors?: MethodEntry[];
  members?: Array<MethodEntry|PropertyEntry>;
  value?: string;
}

interface PropertyEntry {
  name: string;
  type: string;
}

interface MethodEntry {
  name?: string;
  type?: string;
  signature?: string;
  returnType?: string;
  parameters?: ClassEntry[];
  docs?: string[];
  returnTypeFlag?: ts.TypeFlags
  subtypes?: ClassEntry[]
}

export = class FlyProjectMonitor extends EventEmitter {
  project: Project 
  operator: Operator

  constructor () {
    super()
    this.project = new Project({
      tsConfigFilePath: config.tsconfig
    })
    debug('config', config)
    this.project.addSourceFilesAtPaths([ config.files ])
    this.project.resolveSourceFileDependencies()
    const flyModule = this.getFlyModule()
    this.operator = new Operator(flyModule)
    this.on('change', this.updateFn)
      .on('unlink', this.unlinkFn)
  }

  private getFlyModule () {
    const autoGen = this.project.getSourceFile(config.autoGenDef)
    return autoGen.getNamespace(n => {
      return n.getName()?.replace(/'/g, '') === 'fly'
    })
  }

  private updateFn (fileName: string) {
    debug('will update fn: ', fileName)
    this.project.addSourceFileAtPath(fileName)
    const updatedFile = this.project.getSourceFile(fileName)
    const result = updatedFile.refreshFromFileSystemSync()
    debug('result after refresh', result)
    if (!updatedFile) {
      return
    }

    this.operator.updateMatchedFlyInterface(updatedFile)
    const classEntry = this.parseUpdatedFile(updatedFile)
    debug(classEntry)
    if (classEntry) {
      this.addContext(classEntry)
      this.project.emit()
    }
    this.project.saveSync()
  }

  private addImport (moduleSpecifier: string, namedImport: string) {
    const autoGen = this.project.getSourceFile(config.autoGenDef)
    let importDeclaration = autoGen.getImportDeclaration(impt => impt.getModuleSpecifier().getLiteralValue() === moduleSpecifier)
    if (!importDeclaration) {
      autoGen.addImportDeclaration({ namedImports: [ namedImport ], moduleSpecifier })
    } else {
      const oldNamedImports = importDeclaration.getNamedImports().map(imptSpec => imptSpec.getText())
      if (!oldNamedImports.includes(namedImport)) {
        importDeclaration.addNamedImport(namedImport)
      }
    }
  }
  private addContext (classEntry: FlyClassEntry) {
    const flyModule = this.getFlyModule()
    const context = flyModule.getInterface('Context')
    flyModule.getImportDeclarations()
    if (classEntry.eventType.dependencies.length > 0) {
      for (let { type, path } of classEntry.eventType.dependencies) {
        const moduleSpecifier = resolveModule(config.autoGenDef, path)
        this.addImport(moduleSpecifier, type)
      }
    }
    if (classEntry.returnType.dependencies.length > 0) {
      for (let { type, path } of classEntry.returnType.dependencies) {
        this.addImport(resolveModule(config.autoGenDef, path), type)
      }
    }
    const fn = context.getProperty(classEntry.name)
    if (fn) {
      fn.remove()
    }
    debug('class entry', classEntry)
    context.addProperty({
      name: classEntry.name,
      type: `Operator<${classEntry.eventType.text}, ${classEntry.returnType.text}>`
    })
  }

  private parseUpdatedFile (file: SourceFile): FlyClassEntry {
    const klass = file.getClasses().find(cls => cls.isDefaultExport()) 
    if (!klass || !klass.getInstanceMethod('main')) {
      // not fly fn
      debug(`${file.getFilePath()} not fly fn`)
      return
    }
    const eventMethod = klass.getInstanceMethod('before') || klass.getInstanceMethod('main')
    const eventType = {
      text: eventMethod.getParameters()[0].getChildAtIndex(2).getText(),
      dependencies: parseTypeStringForImport(eventMethod.getParameters()[0].getType().getText())
    }
    const returnMethod = klass.getInstanceMethod('after') || klass.getInstanceMethod('main')
    const returnType = {
      text: parseReturnTypeString(returnMethod.getReturnType().getText()),
      dependencies: parseTypeStringForImport(returnMethod.getReturnType().getText())
    }
    return {
      filePath: file.getFilePath(),
      name: firstLowerCase(klass.getName()),
      eventType,
      returnType
    }
  }
  
  private unlinkFn (fileName: string) {
    
  }
}

type ImportType = {
  text: string
  dependencies: Array<Dep>
}
type Dep = {
  path: string
  type: string
}

type FlyClassEntry = {
  filePath: string
  name: string
  eventType: ImportType
  returnType: ImportType
}


function firstLowerCase (name: string) {
  return name[0].toLowerCase() + name.slice(1)
}

function stripExtension (fileName: string) {
  return fileName.endsWith('.d.ts') 
    ? fileName.slice(0, -5) 
    : fileName.endsWith('.ts')
      ? fileName.slice(0, -3)
      : fileName
}

function resolveModule (importFileName: string, exportFileName: string) {
  if (!exportFileName.includes('/')) {
    return exportFileName
  }
  return path.relative(path.dirname(importFileName), stripExtension(exportFileName))
}


const FlyFnPrefix = 'FlyFn'

enum OpIdx {
  beforeEvent = 1, // E11/E12, E2/E3
  before = 2, // E2, E3
  main = 3, // E3, R4
  after = 4,  // R4, R4
  afterEvent = 5, // R4, R51/R52
  // catch = 6, // R6
  // catchEvent = 7, // R7
}

type Op = {
  name: string,
  idx: OpIdx
}
type InterfaceOption = {
  ops: Op[],
  name: string
}

class Operator {
  flyModule: NamespaceDeclaration
  interfaces: InterfaceOption[]
  constructor (flyModule: NamespaceDeclaration) {
    this.flyModule = flyModule
  }

  public updateMatchedFlyInterface (sourceFile: SourceFile) {
    const klass = sourceFile.getClasses().find(cls => cls.isDefaultExport())
    if (!klass) return
    const methods = klass.getInstanceMethods().map(m => m.getName())
    if (!methods.includes('main')) {
      return
    }
    if (!this.interfaces || this.interfaces.length) {
      this.loadFns()
    }
    debug('interfaces', this.interfaces)
    let interfaceOption = this.interfaces.find(intf => isArrayEqual(extractFlyOps(methods), intf.ops.map(op => op.name).filter(n => n !== 'extends')))
    let name: string = interfaceOption?.name
    if (!name) {
      name = FlyFnPrefix + this.interfaces.length
      interfaceOption = { name, ops:  this.genOps(methods, name) }
      this.addFlyFnInterface(interfaceOption)
    }
    if (klass.getImplements().length) {
      klass.removeImplements(0)
    }
    const genericTypes: string[] = interfaceOption.ops.reduce((prev, op) => {
      debug('op', op)
      const method = klass.getInstanceMethod(op.name)
      if (op.idx < OpIdx.main) {
        prev.push(method.getParameters()[0].getChildAtIndex(2).getText())
      } else if (op.idx === OpIdx.main) {
        prev.push(method.getParameters()[0].getChildAtIndex(2).getText())
        prev.push(parseReturnTypeString(method.getReturnType().getTypeArguments()[0].getText()))
      } else {
        prev.push(parseReturnTypeString(method.getReturnType().getTypeArguments()[0].getText()))
      }
      return prev
    }, new Array<string>())
    this.addImport(sourceFile, 'fly', name)
    klass.addImplements(`${name}<${genericTypes.join(', ')}>`)
  }

  private addImport (sourceFile: SourceFile, moduleSpecifier: string, namedImport: string) {
    let importDeclaration = sourceFile.getImportDeclaration(impt => impt.getModuleSpecifier().getLiteralValue() === moduleSpecifier)
    if (!importDeclaration) {
      sourceFile.addImportDeclaration({ namedImports: [ namedImport ], moduleSpecifier })
    } else {
      const oldNamedImports = importDeclaration.getNamedImports().map(imptSpec => imptSpec.getText())
      if (!oldNamedImports.includes(namedImport)) {
        importDeclaration.addNamedImport(namedImport)
      }
    }
  }
  private loadFns () {
    this.interfaces = this.flyModule.getInterfaces()
      .filter(item => item.getName().startsWith('FlyFn'))
      .map(item => {
        const ops = this.genOps(item.getProperties().map(m => m.getName()), item.getName())
        ops.forEach(op => {
          debug('op', op) 
        });
        return { ops, name: item.getName() }
      }
    )
  }

  private genOps (methods: string[], interfaceName: string) {
    return methods
      .filter(name => name == 'main' || name.startsWith('before') || name.startsWith('after'))
      .map(name => {
        let idx: OpIdx
        if (name === 'main') {
          idx = OpIdx.main
        } else if (name === 'before') {
          idx = OpIdx.before
        } else if (name.startsWith('before')) {
          idx = OpIdx.beforeEvent
        } else if (name === 'after') {
          idx = OpIdx.after
        } else if (name.startsWith('after')) {
          idx = OpIdx.afterEvent
        // } else if (name === 'catch') {
        //   idx = OpIdx.catch
        // } else if (name.startsWith('catch')) {
        //   idx = OpIdx.catchEvent
        }
        return { name, idx }
      })
      .sort((op1, op2) => op1.name.localeCompare(op2.name))
      .sort((op1, op2) => op1.idx - op2.idx)
  }

  private addFlyFnInterface (intf: InterfaceOption) {
    debug('add fly interface: ', intf)
    this.interfaces.push(intf)
    debug('interfaces 2', this.interfaces)
    const { ops, name } = intf
    const interfaceDeclaration = this.flyModule.addInterface({ name })
    const interfaceOption = ops.reduce((prev, op) => {
      switch (op.idx) {
        case OpIdx.beforeEvent:
          const beforeEventIdx = countArray<InterfaceMethodOption>(
            prev.methods,
            (m: InterfaceMethodOption) => {
              return m.eventType.startsWith(`E${OpIdx.beforeEvent}`)
            }
          )
          prev.typeParams.push(`E${op.idx}${beforeEventIdx}`)
          prev.methods.push({
            name: op.name,
            eventType: `E${op.idx}${beforeEventIdx}`,
            returnType: `E${OpIdx.main}`
          })
          break
        case OpIdx.before:
          const event = 'E' + OpIdx.before
          prev.typeParams.push(event)
          prev.methods = updateArray<InterfaceMethodOption>(
            prev.methods,
            (m: InterfaceMethodOption) => {
              return m.eventType.startsWith('E' + OpIdx.beforeEvent)
            },
            (m: InterfaceMethodOption) => {
              m.returnType = event
              return m
            }
          )
          prev.methods.push({
            name: op.name,
            eventType: `E${OpIdx.before}`,
            returnType: `E${OpIdx.main}`
          })
          break
        case OpIdx.main:
          prev.typeParams.push('E' + op.idx, 'R' + op.idx)
          prev.methods.push({
            name: op.name,
            eventType: `E${OpIdx.main}`,
            returnType: `R${OpIdx.main}`
          })
          break
        case OpIdx.after:
          prev.typeParams.push('R' + op.idx)
          prev.methods.push({
            name: op.name,
            eventType: `R${OpIdx.main}`,
            returnType: `R${OpIdx.after}`
          })
          break
        case OpIdx.afterEvent:
          const afterEventIdx = countArray<InterfaceMethodOption>(
            prev.methods,
            (m: InterfaceMethodOption) => {
              return m.returnType.startsWith(`R${OpIdx.afterEvent}`)
            }
          )
          prev.typeParams.push(`R${op.idx}${afterEventIdx}`)
          const afterDefined = !!prev.methods.find(m => m.returnType === `R${OpIdx.after}`)
          prev.methods.push({
            name: op.name,
            eventType: `R${afterDefined ? OpIdx.after : OpIdx.main}`,
            returnType: `R${OpIdx.afterEvent}${afterEventIdx}`
          })
          break
      }
      return prev
    }, {
      typeParams: new Array<string>(),
      methods: new Array<InterfaceMethodOption>()
    })
    interfaceDeclaration.addTypeParameters(interfaceOption.typeParams)
    interfaceDeclaration.addProperty({ name: 'extends', type: 'keyof Context', hasQuestionToken: true })

    interfaceDeclaration.addProperties(interfaceOption.methods.map(op => ({
      name: op.name,
      type: `Operator<${op.eventType}, ${op.returnType}>`
    })))
  } 
}

function extractFlyOps (methods: string[]): string[] {
  return methods.filter(m => m === 'main' || m.startsWith('before') || m.startsWith('after'))
}

function isArrayEqual (arr1: string[], arr2: string[]): boolean {
  debug({ arr1, arr2 })
  if (arr1.length !== arr2.length) return false
  for (let item of arr1) {
    if (!arr2.includes(item)) {
      return false
    }
  }
  return true
}

type InterfaceMethodOption = {name: string, eventType: string, returnType: string}

function updateArray<T>(arr: T[], match: (item: T) => boolean, modify: (item: T) => T): T[] {
  for (let i in arr) {
    if (match(arr[i])) {
      arr[i] = modify(arr[i])
    }
  } 
  return arr
}

function countArray<T>(arr: T[], match: (item: T) => boolean): number {
  let c = 0
  for (let i = 0; i < arr.length; i++) {
    if (match(arr[i])) {
      c++
    }
  }
  return c
}

const typeRegImportGlobal = /import\(\"([0-9a-zA-Z_\-\/]+)+\"\)\.([0-9a-zA-Z_]+)/g
const typeRegImport = /import\(\"([0-9a-zA-Z_\-\/]+)+\"\)\.([0-9a-zA-Z_]+)/


function parseTypeStringForImport (typeStr: string) {
  debug('parse type ', typeStr)
  let results = [] 
  const rets = typeStr.match(typeRegImportGlobal)
  if (rets) {
    for (let ret of rets) {
      const [ , path, type ] = ret.match(typeRegImport)
       results.push({ path, type })
    }
  }
  debug('deps', results)
  return results
}

const typeRegPromise = /Promise<(.+)>/
function removePromise (typeStr: string) {
  const ret2 = typeStr.match(typeRegPromise)
  if (ret2) {
    return ret2[1]
  }
  return typeStr 
}
const typeRegRemoveImport = /import\(\"([0-9a-zA-Z_\-\/]+)+\"\)\./g
function removeImportPath (typeStr: string) {
  return typeStr.replace(typeRegRemoveImport, '')
}

function parseReturnTypeString (typeStr: string) {
  const typeStr2 = removePromise(typeStr)
  return removeImportPath(typeStr2)
}