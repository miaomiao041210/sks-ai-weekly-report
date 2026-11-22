# 三棵树美好生活部周报 · 公开 Demo

静态交互演示页，展示脱敏样例周报的 8 张表格、6 张 TOP3 图表、AI 批注和 Word 下载。

- 不运行后端，不现场调用模型。
- AI 分析为构建期预生成。
- 数据为脱敏样例，不代表真实经营结论。

## 本地预览

```bash
python3 -m http.server 8502
```

打开 `http://localhost:8502`。

## 部署

推送到 GitHub 后，仓库内置 GitHub Pages workflow 会自动发布。
