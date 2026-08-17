import { Button, Tooltip } from 'antd'
import { LinkOutlined, ArrowUpOutlined } from '@ant-design/icons'

export function LinkCard({ url }: { url: string }) {
  return (
    <Tooltip title="在独立预览视图中打开">
      <Button
        type="link"
        icon={<LinkOutlined />}
        onClick={() => {
          window.chatAPI?.openLink(url)
          window.dispatchEvent(new Event('gc:preview-open'))
        }}
      >
        {url}
        <ArrowUpOutlined style={{ marginLeft: 4 }} />
      </Button>
    </Tooltip>
  )
}
