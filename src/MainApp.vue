<template>
  <div class="main-div" @mouseenter="handleMouseEnter" @mouseleave="handleMouseLeave">
    <MonacoEditor
      ref="code_editor"
      class="code-editor"
      @keydown.ctrl.enter="executeCode"
      @update:value="onEditorContentChange"
    />
    <div class="middle-toolbar flex bg-gray-200">
      <el-tooltip content="Ctrl+Enter to Run" :show-after="500">
        <button
          class="bg-blue-500 hover:bg-blue-400 text-gray-800 font-bold py-0.75 px-4 inline-flex items-center cursor-pointer"
          @click="executeCode"
        >
          <el-icon color="white">
            <CaretRight />
          </el-icon>
          <span class="font-medium text-white">Run</span>
        </button>
      </el-tooltip>

      <pre v-if="finishedTime.length > 0" class="run-time-text text-green-600">
Save and run finished at: {{ finishedTime }}. Cost: {{ costSeconds }}s</pre
      >

      <el-tooltip content="Global settings" :show-after="500">
        <button
          class="hover:bg-gray-300 text-gray-800 font-bold py-0.75 px-2 inline-flex items-center cursor-pointer ml-auto"
          v-show="isHover"
          @click="configDialogVisible = true"
        >
          <el-icon color="black">
            <Setting />
          </el-icon>
        </button>
      </el-tooltip>
    </div>

    <!-- 执行结果展示 -->
    <div class="output-section">
      <pre class="text-gray-900" style="white-space: pre-wrap">{{ result }}</pre>
    </div>
  </div>

  <el-dialog title="Global Settings" v-model="configDialogVisible" width="50%">
    <el-form :model="config" label-position="top" class="px-4">
      <el-form-item label="主题颜色">
        <el-select v-model="config.theme" placeholder="Theme" style="width: 200px">
          <el-option label="vs-light" value="vs-light" />
          <el-option label="vs-dark" value="vs-dark" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <template v-slot:label>
          <span>预安装 pip 包，格式参考 requirements.txt 写法。可用包列表参考：</span>
          <a
            href="https://pyodide.org/en/stable/usage/packages-in-pyodide.html"
            target="_blank"
            class="text-blue-600 dark:text-blue-500 hover:underline"
            >https://pyodide.org/en/stable/usage/packages-in-pyodide.html</a
          >
        </template>
        <el-input
          v-model="config.pipPackages"
          placeholder="e.g. numpy==2.0.2"
          :rows="8"
          type="textarea"
        />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="saveConfig">保存</el-button>
      </el-form-item>
    </el-form>
  </el-dialog>
</template>

<script lang="ts">
import { loadPyodide } from 'pyodide'
import MonacoEditor from '@/components/MonacoEditor.vue'
import { CaretRight, RefreshRight, Setting } from '@element-plus/icons-vue'
import {
  currentWidgetID,
  GetConfig,
  GetWidgetData,
  SaveConfig,
  SaveWidgetData,
  siyuanClient,
} from '@/utils/siyuan_client.js'
import { ElLoading, ElMessage } from 'element-plus'

export default {
  name: 'MainApp',
  components: { Setting, RefreshRight, CaretRight, MonacoEditor },
  data() {
    return {
      result: '',
      loading: null,
      pyodide: null,
      finishedTime: '',
      costSeconds: 0,
      startExecuteTime: 0,
      isHover: false,
      hoverTimeout: null,
      configDialogVisible: false,
      config: {
        theme: 'vs-light',
        pipPackages: '',
      },
    }
  },

  async mounted() {
    this.loading = true

    const loadingInstance = ElLoading.service({
      lock: true,
      fullscreen: true,
      text: 'Loading...',
      spinner: 'el-icon-loading',
      background: 'rgba(0, 0, 0, 0.7)',
    })

    await Promise.all([this.waitLoadingPyodide(), this.waitKernelBoot()])
    const cfg = await GetConfig()
    if (cfg) {
      this.config = cfg
    }
    this.$refs.code_editor.setEditorTheme(this.config.theme)
    await this.installRequiredPackages(this.config.pipPackages)

    loadingInstance.close()
    this.loading = false
  },

  methods: {
    async validatePipPackages() {
      const loadingInstance = ElLoading.service({
        lock: true,
        text: 'Validating pip packages...',
        spinner: 'el-icon-loading',
        background: 'rgba(0, 0, 0, 0.7)',
      })

      const packages = this.config.pipPackages
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
      try {
        const result = await Promise.all(
          packages.map((pkg) =>
            this.pyodide.runPythonAsync(`
          import micropip
          await micropip.install('${pkg}')
          `),
          ),
        )
      } catch (error) {
        loadingInstance.close()
        ElMessage.error({
          message: `Failed to install pip packages: ${error}`,
        })
        return false
      }
      loadingInstance.close()
      return true
    },

    async saveConfig() {
      if (!(await this.validatePipPackages())) {
        return
      }

      this.$refs.code_editor.setEditorTheme(this.config.theme);

      await SaveConfig(this.config)
      this.configDialogVisible = false
    },

    installRequiredPackages(pipPackages) {
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
    },

    handleMouseEnter() {
      // 清除可能的延迟关闭定时器
      if (this.hoverTimeout) {
        clearTimeout(this.hoverTimeout)
      }
      this.isHover = true
    },
    handleMouseLeave() {
      // 添加一点延迟避免快速移出时闪烁
      this.hoverTimeout = setTimeout(() => {
        this.isHover = false
      }, 100)
    },

    async waitKernelBoot() {
      while (true) {
        try {
          await siyuanClient.currentTime()
          const rsp = await siyuanClient.bootProgress()
          break
        } catch (e) {
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
      }
      await this.setupEditor()

    },

    async waitLoadingPyodide() {
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
    `)

      this.$refs.code_editor.setPyodide(this.pyodide)
    },

    async setupEditor() {
      const savedData = await GetWidgetData()
      this.$refs.code_editor.setEditorContent(savedData.code || '')
      this.finishedTime = savedData.finishedTime || ''
      this.costSeconds = savedData.costSeconds || 0
      this.result = savedData.result || ''
    },

    async atExecuteFinish() {
      this.finishedTime = new Date().toLocaleString()
      this.costSeconds = ((new Date().getTime() - this.startExecuteTime) / 1000).toFixed(2)

      await SaveWidgetData({
        code: this.$refs.code_editor.getEditorContent(),
        finishedTime: this.finishedTime,
        costSeconds: this.costSeconds,
        result: this.result,
      })
    },

    async onEditorContentChange() {
      await SaveWidgetData({
        code: this.$refs.code_editor.getEditorContent(),
        finishedTime: this.finishedTime,
        costSeconds: this.costSeconds,
        result: this.result,
      })
    },

    async executeCode() {
      this.startExecuteTime = new Date().getTime()
      const value = this.$refs.code_editor.getEditorContent()
      if (!value) {
        this.result = 'Execution successful (no output)'
        this.atExecuteFinish()

        return
      }

      this.result = ''

      try {
        // 重定向输出
        const output = []
        this.pyodide.setStdout({ batched: (text) => output.push(text) })

        // 执行代码
        await this.pyodide.runPythonAsync(value)

        // 保存结果
        this.result = output.join('\n') || 'Execution successful (no output)'
        console.log("result:", this.result)
      } catch (error) {
        this.result = error.toString()
      } finally {
        this.atExecuteFinish()
      }
    },
  },
}
</script>

<style>
.main-div {
  width: 100%;
  min-height: 100%;
  margin: auto;
  padding: 8px;
  background: #f8f9fa;
}

.code-editor {
  width: 95vw;
  height: 60vh;
  margin: auto;
}

.middle-toolbar {
  height: 22px;
  line-height: 22px;
  width: 95vw;
  margin: auto;
}

.output-section {
  width: 95vw;
  min-height: 10vh;
  padding: 12px;
  margin: auto;
  font-size: 12px;
  background: #f9f8f7;
}

.run-time-text {
  font-size: 11px;
  margin-left: 12px;
}
</style>
