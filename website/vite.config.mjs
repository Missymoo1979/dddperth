import mdx from '@mdx-js/rollup'
import { vitePlugin as remix } from '@remix-run/dev'
import rehypePrettyCode from 'rehype-pretty-code'
import remarkFrontmatter from 'remark-frontmatter'
import remarkMdxFrontmatter from 'remark-mdx-frontmatter'
import { remixDevTools } from 'remix-development-tools'
import { remixRoutes } from 'remix-routes/vite'
import { defineConfig } from 'vite'
import svgr from 'vite-plugin-svgr'
import tsconfigPaths from 'vite-tsconfig-paths'

const prettyCodeOptions = {
    theme: 'catppuccin-latte',
}

export default defineConfig({
    // eslint-disable-next-line no-undef
    root: __dirname,
    server: {
        port: 3800,
        hmr: {
            port: 3805,
        },
    },
    plugins: [
        tsconfigPaths(),
        remixDevTools(),
        mdx({
            remarkPlugins: [remarkFrontmatter, remarkMdxFrontmatter],
            rehypePlugins: [[rehypePrettyCode, prettyCodeOptions]],
            /* jsxImportSource: …, otherOptions… */
        }),
        remix({
            buildDirectory: 'build/remix',
        }),
        remixRoutes({
            outDir: '.',
            strict: true,
        }),
        svgr(),
    ],
})