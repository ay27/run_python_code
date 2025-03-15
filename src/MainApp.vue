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
    <div class="output-section" ref="output_section">
      <pre class="text-gray-900" style="white-space: pre-wrap">{{ result }}</pre>
      <div ref="matplotlibImageDiv" id="target" class="p-2"></div>
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
          <span
            >预安装 pip 包，格式参考 requirements.txt 写法。仅支持纯 python 语言的 pip
            包，具体参考：</span
          >
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
  GetConfig,
  GetWidgetData,
  SaveConfig,
  SaveWidgetData,
  siyuanClient,
} from '@/utils/siyuan_client.js'
import { ElLoading, ElMessage } from 'element-plus'
import { PyodideWrapper } from './utils/pyodide_wrapper'

// Start of Selection
export default {
  name: 'MainApp',
  components: { Setting, CaretRight, MonacoEditor }, // 移除未使用的 RefreshRight 组件
  data() {
    return {
      result: '',
      loading: false,
      pyodideWrapper: null as PyodideWrapper | null,
      canvasImages: {} as Record<string, string>,
      finishedTime: '',
      costSeconds: 0,
      startExecuteTime: 0,
      isHover: false,
      hoverTimeout: 0,
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
    this.$refs.code_editor.setPyodide(this.pyodideWrapper?.pyodide)
    await this.pyodideWrapper?.installPackages(this.config.pipPackages)

    loadingInstance.close()
    this.loading = false
  },

  methods: {
    async saveConfig() {
      if (!(await this.pyodideWrapper?.validatePipPackages(this.config.pipPackages))) {
        return
      }

      this.$refs.code_editor.setEditorTheme(this.config.theme)

      await SaveConfig(this.config)
      this.configDialogVisible = false
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
          await siyuanClient.bootProgress()
          break
        } catch (e) {
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
      }
      await this.setupEditor()
    },

    async waitLoadingPyodide() {
      this.pyodideWrapper = new PyodideWrapper()
      await this.pyodideWrapper.intialize()
    },

    async setupEditor() {
      const savedData = await GetWidgetData()
      this.finishedTime = savedData.finishedTime || ''
      this.costSeconds = savedData.costSeconds || 0
      this.result = savedData.result || ''

      this.$refs.matplotlibImageDiv.innerHTML = savedData.matplotlibDiv || ''
      this.canvasImages = savedData.canvasImages || {}
      // console.log('canvasImages:', this.canvasImages)

      for (const canvasId in this.canvasImages) {
        const canvas = document.getElementById(canvasId)
        // console.log('canvas:', canvas)
        if (canvas) {
          const img = new Image()
          img.src = this.canvasImages[canvasId]
          img.onload = () => {
            const ctx = canvas.getContext('2d')
            canvas.width = img.naturalWidth
            canvas.height = img.naturalHeight
            ctx.drawImage(img, 0, 0)
          }
        }
      }
      // 设置编辑器内容，它需要在最后设置，因为设置内容会触发编辑器内容变更事件，导致上面的数据被覆盖
      this.$refs.code_editor.setEditorContent(savedData.code || '')
    },

    async atExecuteFinish() {
      this.finishedTime = new Date().toLocaleString()
      this.costSeconds = ((new Date().getTime() - this.startExecuteTime) / 1000).toFixed(2)

      // const matplotlibDiv = document.querySelector('div[id^="matplotlib_"]')
      // if (matplotlibDiv) {
      //   this.$refs.matplotlibImageDiv.innerHTML = matplotlibDiv.innerHTML
      //   matplotlibDiv.remove()
      // }

      setTimeout(async () => {
        // console.log('start save data')
        this.canvasImages = {}
        const canvasList = document.querySelectorAll('canvas[id^="matplotlib_"]')
        // 怎么确认 canvas 确实已经绘制完成了呢？

        // console.log('canvasList:', canvasList)
        for (const canvas of canvasList) {
          const img = canvas.toDataURL('image/png')
          const ctx = canvas.getContext('2d')
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data
          const isEmpty = Array.from(imageData).every((v) => v === 0)
          // console.log(isEmpty ? 'Canvas 为空' : 'Canvas 有内容')
          if (!isEmpty) {
            this.canvasImages[canvas.id] = img
          }
        }

        await SaveWidgetData({
          code: this.$refs.code_editor.getEditorContent(),
          finishedTime: this.finishedTime,
          costSeconds: this.costSeconds,
          result: this.result,
          matplotlibDiv: this.$refs.matplotlibImageDiv?.innerHTML || '',
          canvasImages: this.canvasImages,
        })
      }, 1000)
    },

    async onEditorContentChange() {
      await SaveWidgetData({
        code: this.$refs.code_editor.getEditorContent(),
        finishedTime: this.finishedTime,
        costSeconds: this.costSeconds,
        result: this.result,
        matplotlibDiv: this.$refs.matplotlibImageDiv?.innerHTML || '',
        canvasImages: this.canvasImages,
      })
    },

    async executeCode() {
      this.startExecuteTime = new Date().getTime()
      let value = this.$refs.code_editor.getEditorContent()
      if (!value) {
        this.result = 'Execution successful (no output)'
        this.atExecuteFinish()

        return
      }

      this.result = ''
      this.$refs.matplotlibImageDiv.innerHTML = ''
      const canvasList = document.querySelectorAll('canvas[id^="matplotlib_"]')
      for (const canvas of canvasList) {
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        canvas.remove()
      }
      this.canvasImages = {}

      try {
        // 重定向输出
        const output = []
        this.pyodideWrapper?.pyodide.setStdout({ batched: (text) => output.push(text) })

        document.pyodideMplTarget = document.getElementById('target')

        // 执行代码
        if (value.includes('matplotlib')) {
          value += `
import matplotlib.pyplot as plt
plt.close()
          `
        }

        await this.pyodideWrapper?.pyodide.runPythonAsync(value)

        // 保存结果
        this.result = output.join('\n') || 'Execution successful (no output)'
        // console.log('result:', this.result)
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
  height: 40vh;
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
