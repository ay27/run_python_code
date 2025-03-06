<template>
  <div class="main-div">
    <MonacoEditor
      ref="code_editor"
      :pyodide="pyodide"
      language="python"
      class="code-editor"
      @keydown.ctrl.enter="executeCode"
      @update:value="onEditorContentChange"
    />
    <div class="head-toolbar flex bg-gray-200">
      <el-tooltip content="Ctrl+Enter to Run" show-after="500">
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

      <!--      <el-tooltip content="Clear Result" show-after="500">-->
      <!--        <button-->
      <!--          class="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-0.75 px-2 inline-flex items-center cursor-pointer"-->
      <!--          @click="executeCode"-->
      <!--        >-->
      <!--          <el-icon>-->
      <!--            <RefreshRight/>-->
      <!--          </el-icon>-->
      <!--        </button>-->
      <!--      </el-tooltip>-->

      <pre v-if="finishedTime.length > 0" class="run-time-text text-green-600">
Save and run finished at: {{ finishedTime }}. Cost: {{ costSeconds }}s</pre
      >
    </div>

    <!-- 执行结果展示 -->
    <div class="output-section">
      <pre class="text-gray-900" style="white-space: pre-wrap">{{ result }}</pre>
    </div>
  </div>
</template>

<script lang="ts">
import { loadPyodide } from 'pyodide'
import MonacoEditor from '@/components/MonacoEditor.vue'
import { CaretRight, RefreshRight } from '@element-plus/icons-vue'
import {
  currentWidgetID,
  GetWidgetData,
  SaveWidgetData,
  siyuanClient,
} from '@/utils/siyuan_client.js'
import { ElLoading } from 'element-plus'

export default {
  name: 'MainApp',
  components: { RefreshRight, CaretRight, MonacoEditor },
  data() {
    return {
      result: '',
      loading: null,
      pyodide: null,
      finishedTime: '',
      costSeconds: 0,
      startExecuteTime: 0,
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
    });

    Promise.all([this.waitLoadingPyodide(), this.waitKernelBoot()])

    loadingInstance.close()

    this.loading = false
  },

  methods: {
    async waitKernelBoot() {
      console.log('Waiting for kernel boot...')
      while (true) {
        try {
          await siyuanClient.currentTime()
          const rsp = await siyuanClient.bootProgress()
          console.log('boot progress', rsp)
          break
        } catch (e) {
          console.log('Waiting for kernel boot...', e)
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

      console.log('Executing code:', value)

      this.result = ''

      try {
        // 重定向输出
        const output = []
        this.pyodide.setStdout({ batched: (text) => output.push(text) })

        // 执行代码
        await this.pyodide.runPythonAsync(value)

        // 保存结果
        this.result = output.join('\n') || 'Execution successful (no output)'
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

.head-toolbar {
  height: 22px;
  line-height: 22px;
  width: 95vw;
  margin: auto;
  padding-right: 12px;
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
  margin-left: auto;
  font-size: 11px;
}
</style>
