<template>
  <div ref="editorContainer" class="editor-container"></div>
</template>

<script>
import * as monaco from 'monaco-editor'

export default {
  name: 'MonacoEditor',
  props: {
    language: {
      type: String,
      default: 'python',
    },
    // pyodide: {
    //   type: Object,
    //   default: null,
    // },
    theme: {
      type: String,
      default: 'vs-light',
    },
    options: {
      type: Object,
      default: () => ({}),
    },
    editable: {
      type: Boolean,
      default: true,
    },
  },
  expose: ['getEditorContent', 'setEditorContent', 'setPyodide', 'setEditorTheme'],
  emits: ['update:value'],
  watch: {
    value(newValue) {
      if (this.editor && newValue !== this.editor.getValue()) {
        this.editor.setValue(newValue)
      }
    },
  },
  methods: {
    updateEditorSize() {
      if (this.editor) {
        this.editor.layout()
      }
    },

    setEditorTheme(theme) {
      if (this.editor) {
        monaco.editor.setTheme(theme)
      }
    },

    setEditorContent(value) {
      if (this.editor) {
        this.editor.setValue(value)
      }
    },

    getEditorContent() {
      if (this.editor) {
        return this.editor.getValue()
      }
      return ''
    },

    setPyodide(pyodide) {
      this.pyodide = pyodide
    },

    initializeCompletion() {
      monaco.languages.registerCompletionItemProvider('python', {
        triggerCharacters: ['.', ' '], // 触发补全的字符
        provideCompletionItems: async (model, position) => {
          if (!this.pyodide) {
            return { suggestions: [] }
          }

          const code = model.getValue()
          const line = position.lineNumber //起始为 1
          const column = position.column - 1 //起始为 0

          try {
            const pyCompletions = await this.pyodide.runPythonAsync(`
          import jedi
          jedi.settings.fast_parser = True
          script = jedi.Script(code=${JSON.stringify(code)})
          completions = script.complete(${line}, ${column})
          [{"name": c.name, "type": c.type, "doc": c.docstring() or ""} for c in completions if c.name[0]]
      `)

            // 将Python元组列表转换为JS对象数组
            const completions = pyCompletions.toJs().map((c) => ({
              name: c['name'],
              type: c['type'],
              doc: c['doc'],
            }))

            const ret = {
              suggestions: completions.map((c) => ({
                label: c.name,
                kind: getCompletionItemKind(c.type),
                documentation: c.doc,
                insertText: c.name,
              })),
            }

            return ret
          } catch (error) {
            console.error('Completion error:', error)
            return { suggestions: [] }
          }
        },
      })

      // 映射Jedi类型到Monaco的CompletionItemKind
      function getCompletionItemKind(jediType) {
        const map = {
          module: monaco.languages.CompletionItemKind.Module,
          class: monaco.languages.CompletionItemKind.Class,
          function: monaco.languages.CompletionItemKind.Function,
          instance: monaco.languages.CompletionItemKind.Variable,
          keyword: monaco.languages.CompletionItemKind.Keyword,
        }
        return map[jediType] || monaco.languages.CompletionItemKind.Property
      }
    },
  },
  mounted() {
    this.editor = monaco.editor.create(this.$refs.editorContainer, {
      value: this.value,
      language: this.language,
      theme: this.theme,
      readOnly: !this.editable,
      automaticLayout: true,
      minimap: { enabled: false },
      wordWrap: 'on',
      trimAutoWhitespace: true,
      wordBasedSuggestions: 'currentDocument',
      scrollbar: {
        alwaysConsumeMouseWheel: false,
      },
      ...this.options,
    })
    this.editor.onDidChangeModelContent(() => {
      this.$emit('update:value', this.editor.getValue())
    })

    this.initializeCompletion()

    window.addEventListener('resize', this.updateEditorSize)
  },
  beforeUnmount() {
    if (this.editor) {
      this.editor.dispose()
    }
    window.removeEventListener('resize', this.updateEditorSize)
  },
}
</script>

<style>
.editor-container {
  width: 100%;
  height: 100%;
  border: 1px solid #ebeef5;
  margin: 4px;
}
</style>
