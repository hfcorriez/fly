import chokidar from 'chokidar'
import path from 'path'
import Debug from 'debug'
import FlyProjectMonitor from '../lib/tsc-helper'
const debug = Debug('FLY:TS_HELPER')

class Helper {
  public extends: string
  public config: object
  watcher: chokidar.FSWatcher
  public fileMap: Map<string, number>
  public cwd = process.cwd()
  constructor () {
    this.extends = 'server'
    this.config = {
      command: 'tsc',
      name: 'tsc'
    }
    this.fileMap = new Map<string, number>()
  }
  init () {
    const sourceFiles = path.join(this.cwd, 'src/**/*')
    this.watcher = chokidar.watch(sourceFiles, {
      cwd: this.cwd,
      ignored: ['**/*.js', '**/*.d.ts', '**/*.yml', '**/*.log', '**/*.js.map'],
      ignoreInitial: true
    })
  }

  run() {
    const monitor = new FlyProjectMonitor()
    const eventHandler = (evt: string, filePath: string) => {
      debug(evt, filePath)
      const now = Date.now()
      const key = `${evt}:${filePath}`
      const lastUpdatedAt = this.fileMap.get(key)
      if (lastUpdatedAt && (now - lastUpdatedAt < 5000)) {
        return
      }
      this.fileMap.set(key, now)
      monitor.emit(evt, filePath)  
    }
    this.watcher.on('all', eventHandler)
    return true
  }

}

export = Helper
