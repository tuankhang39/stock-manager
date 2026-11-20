# XiaoxinStock

Ứng dụng tồn kho BHLĐ (bản **web**). Người dùng mở web, nhập **đúng mã** bạn cấp là dùng được.

## Lệnh

```bash
npm install
npm run keys:gen       # tạo mã → keys-private.txt (bí mật) + hash trong src/license-keys.json
npm run dev            # chạy thử (http://127.0.0.1:5173)
npm run build          # build web → dist/
npm run preview        # xem thử bản build (http://127.0.0.1:4173)
```

Deploy: đưa nguyên thư mục `dist/` lên hosting tĩnh (Netlify, Vercel, Cloudflare Pages, GitHub Pages, nginx...). Cần HTTPS (hoặc localhost) để kích hoạt.

Thêm mã mới: `npm run keys:append` rồi build lại.

Phát cho khách mã trong `keys-private.txt` — không commit file này lên git.

Lưu ý: kích hoạt chạy hoàn toàn phía trình duyệt (hash mã nằm trong bundle, trạng thái lưu localStorage) nên chỉ là rào cản nhẹ, không chống được người rành kỹ thuật.
