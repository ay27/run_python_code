import { ElLoading, ElMessage } from 'element-plus'
import { loadPyodide } from 'pyodide'

export class PyodideWrapper {
  public pyodide: any

  public async intialize() {
    // 加载 Pyodide
    this.pyodide = await loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.2/full/',
      stdout: console.log,
      stderr: console.error,
      packageCacheDir: 'pyodide-packages',
    })

    await this.pyodide.loadPackage(['micropip'])
    await this.pyodide.runPythonAsync(`
    import micropip
    await micropip.install('jedi')
    await micropip.install('black')
    `)
  }

  public async installPackages(pipPackages: string) {
    if (!pipPackages) {
      return
    }

    const packages = pipPackages
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
    return Promise.all(
      packages.map((pkg) =>
        this.pyodide.runPythonAsync(`
          import micropip
          await micropip.install('${pkg}')
          `),
      ),
    )
  }

  public async validatePipPackages(pipPackages: string) {
    const loadingInstance = ElLoading.service({
      lock: true,
      text: 'Validating pip packages...',
      spinner: 'el-icon-loading',
      background: 'rgba(0, 0, 0, 0.7)',
    })

    try {
      await this.installPackages(pipPackages)
    } catch (error) {
      loadingInstance.close()
      ElMessage.error({
        message: `Failed to install pip packages: ${error}`,
      })
      return false
    }
    loadingInstance.close()
    return true
  }
}
