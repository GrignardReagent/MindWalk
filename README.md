# MindWalk

边走边说，录音转成文字后整理成思维导图。默认通过爱丁堡大学的 ELM 调用模型，也兼容其他 OpenAI 格式的接口。

## 启动

只需要做一次：

```bash
npm install
cp .env.example .env   # 然后把 ELM API key 填进 .env 的 OPENAI_API_KEY
```

手机浏览器只在 HTTPS 下开放麦克风，所以还需要一个隧道工具，例如 cloudflared。可以自己安装，也可以看过 `scripts/setup.sh` 后用 `bash scripts/setup.sh` 运行它，它会下载到 `bin/` 并校验 SHA-256。

每次使用，开两个终端：

```bash
# 终端 1：启动服务器
set -a; . ./.env; set +a
npm start
```

```bash
# 终端 2：开隧道，它会打印 https://...trycloudflare.com
bin/cloudflared tunnel --url http://localhost:8787
```

在手机上打开终端 2 打印的 `https://...trycloudflare.com`。运行期间两个终端和这台电脑都要开着。每次重启隧道地址都会变。

这个服务器没有访问码，拿到隧道地址的人都能花你的 ELM 额度，所以不要转发，用完就关掉隧道。

## 锁屏录音

录音会边录边存到手机上，结束后再上传，所以中途断网不会丢。

| 手机 | 怎么录 |
|---|---|
| Android（Chrome） | 点“开始录音”，然后锁屏。第一次请先录几分钟试试，结束时页面会告诉你有没有漏录 |
| iPhone | 网页录音时屏幕必须亮着，这是 iOS 的限制。要锁屏，就用“语音备忘录”录完，存到“文件”，再点“上传录音” |

## 语言

右上角的按钮可以切换中文和英文，手机会记住选择。第一次打开时跟随手机语言。口述内容保持你说话用的语言，不会被翻译。

## 配置

| `.env` 变量 | 默认值 | 作用 |
|---|---|---|
| `OPENAI_API_KEY` | 无 | 必填 |
| `OPENAI_BASE_URL` | OpenAI 官方地址 | 用 ELM 时填 `https://elm.edina.ac.uk/api/v1` |
| `OPENAI_MODEL` | `gpt-5.6-sol` | 整理想法的模型 |
| `OPENAI_TRANSCRIBE_MODEL` | `whisper-1` | 转写模型。只有 `whisper-1` 能做漏录检查 |

## 已知限制

- 单个音频不能超过 25 MB。App 内录音约 2.5 小时会自动结束，语音备忘录大约 25 分钟就可能到这个大小。
- 导图只存在手机浏览器里，换手机或清除网站数据会丢失。可以在“大纲”页复制备份。
- 录完才出导图，录音时不会实时显示文字。
- `app/index.html` 也是 claude.ai 版页面的源码，那个版本不能录音。

## 测试

```bash
npm test
```
