import type { FormatRequest, FormatResponse } from '../lib/prettier'

type WorkerContext = {
  onmessage: ((event: MessageEvent<FormatRequest>) => void) | null
  postMessage: (message: FormatResponse) => void
}

const ctx = self as unknown as WorkerContext

async function loadPlugins(parser: string) {
  switch (parser) {
    case 'babel':
    case 'json': {
      const [babel, estree] = await Promise.all([
        import('prettier/plugins/babel'),
        import('prettier/plugins/estree'),
      ])
      return [babel, estree]
    }
    case 'typescript': {
      const [typescript, estree] = await Promise.all([
        import('prettier/plugins/typescript'),
        import('prettier/plugins/estree'),
      ])
      return [typescript, estree]
    }
    case 'html':
      return [await import('prettier/plugins/html')]
    case 'angular':
      return [await import('prettier/plugins/angular')]
    case 'css':
    case 'scss':
    case 'less':
      return [await import('prettier/plugins/postcss')]
    case 'md':
    case 'mdx':
      return [await import('prettier/plugins/markdown')]
    case 'yaml':
      return [await import('prettier/plugins/yaml')]
    case 'graphql':
      return [await import('prettier/plugins/graphql')]
    default:
      throw new Error(`Prettier tidak mendukung parser ${parser}`)
  }
}

ctx.onmessage = async (event) => {
  const { id, code, parser, options } = event.data

  try {
    const [prettier, plugins] = await Promise.all([
      import('prettier/standalone'),
      loadPlugins(parser),
    ])
    const result = await prettier.format(code, {
      parser,
      plugins,
      printWidth: options.printWidth,
      tabWidth: options.tabWidth,
      semi: options.semi,
      singleQuote: options.singleQuote,
    })
    ctx.postMessage({ id, ok: true, result })
  } catch (error) {
    ctx.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
