import { Client } from '@siyuan-community/siyuan-sdk'

/* 初始化客户端 (默认使用 Axios 发起 XHR 请求) */
export const siyuanClient = new Client({
  /**
   * (可选) 思源内核服务 token
   * @default: <空>
   */
  // token: "a4namxlnbam7b33m", // , 默认为空

  /**
   * (可选) Axios 其他请求配置
   * REF: https://axios-http.com/zh/docs/req_config
   * REF: https://www.axios-http.cn/docs/req_config
   */
})

export const currentWidgetID = window?.frameElement?.parentElement?.parentElement?.dataset.nodeId

export async function SaveWidgetData(data: any) {
  const rsp = await siyuanClient.setBlockAttrs({
    id: currentWidgetID,
    attrs: {
      data: JSON.stringify(data),
    },
  })

  if (rsp.code !== 0) {
    throw new Error(rsp.message)
  }
}

export async function GetWidgetData() {
  const rsp = await siyuanClient.getBlockAttrs({
    id: currentWidgetID,
  })

  // console.log('GetWidgetData', rsp)

  if (rsp.code !== 0) {
    return {}
  }

  return JSON.parse(rsp.data?.data || '{}')
}

export async function SaveConfig(config: any) {
  const rsp = await siyuanClient.putFile({
    path: '/data/widgets/run_python_code_config.json',
    file: JSON.stringify(config),
  })
  if (rsp.code !== 0) {
    throw new Error(rsp.message)
  }
}

export async function GetConfig() {
  try {
    const rsp = await siyuanClient.getFile(
      {
        path: '/data/widgets/run_python_code_config.json',
      },
      'json',
    )
    return rsp
  } catch (error) {
    console.error(error)
    return null
  }
}
