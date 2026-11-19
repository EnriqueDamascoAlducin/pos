@php
    // La página de error no pasa por los middleware de la app: se resuelve aquí lo necesario.
    try {
        $business = \App\Models\Setting::get('business_name') ?: config('app.name');
    } catch (\Throwable) {
        $business = config('app.name');
    }

    $appearance = request()->cookie('appearance', 'system');
    $home = route('home');
    $seconds = 10;
@endphp
<!DOCTYPE html>
<html lang="es" @class(['dark' => $appearance === 'dark'])>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>Pieza no encontrada · {{ $business }}</title>
    <script>
        (function () {
            var appearance = @json($appearance);
            if (appearance === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                document.documentElement.classList.add('dark');
            }
        })();
    </script>
    <style>
        :root {
            color-scheme: light;
            --bg: #fafaf9;
            --card: #ffffff;
            --ink: #1c1917;
            --muted: #78716c;
            --line: #e7e5e4;
            --accent: #ea580c;
            --accent-ink: #ffffff;
        }
        .dark {
            color-scheme: dark;
            --bg: #0c0a09;
            --card: #1c1917;
            --ink: #f5f5f4;
            --muted: #a8a29e;
            --line: #292524;
            --accent: #f97316;
            --accent-ink: #1c1917;
        }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            padding: 24px 16px;
            background: var(--bg);
            color: var(--ink);
            font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
        }
        main {
            width: 100%;
            max-width: 520px;
            text-align: center;
            background: var(--card);
            border: 1px solid var(--line);
            border-radius: 16px;
            padding: 40px 28px 32px;
        }
        .code {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            font-size: 88px;
            font-weight: 800;
            line-height: 1;
            letter-spacing: -2px;
        }
        .gear {
            width: 84px;
            height: 84px;
            color: var(--accent);
            animation: spin 6s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) { .gear { animation: none; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        .business {
            margin: 20px 0 4px;
            font-size: 13px;
            font-weight: 600;
            letter-spacing: .06em;
            text-transform: uppercase;
            color: var(--muted);
        }
        h1 { margin: 0 0 10px; font-size: 24px; line-height: 1.25; }
        p { margin: 0 auto; max-width: 400px; color: var(--muted); font-size: 15px; line-height: 1.55; }
        .actions { margin-top: 28px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
        .btn {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 12px 22px;
            border-radius: 10px;
            background: var(--accent);
            color: var(--accent-ink);
            font-weight: 600;
            font-size: 15px;
            text-decoration: none;
        }
        .btn:hover { filter: brightness(1.05); }
        .btn:focus-visible { outline: 3px solid var(--ink); outline-offset: 3px; }
        .countdown { font-size: 13px; color: var(--muted); }
        .countdown strong { color: var(--ink); font-variant-numeric: tabular-nums; }
    </style>
</head>
<body>
    <main>
        <div class="code" aria-label="Error 404">
            <span>4</span>
            <svg class="gear" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>
            </svg>
            <span>4</span>
        </div>

        <div class="business">{{ $business }}</div>
        <h1>Esta pieza no está en el catálogo</h1>
        <p>
            Buscamos en todo el almacén y no encontramos la página que pediste.
            Puede que el enlace esté mal escrito o que ya no exista.
        </p>

        <div class="actions">
            <a class="btn" href="{{ $home }}">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>
                Volver al inicio
            </a>
            <div class="countdown" aria-live="polite">
                Te llevamos al inicio en <strong id="seconds">{{ $seconds }}</strong> s
            </div>
        </div>
    </main>

    <script>
        (function () {
            var left = {{ $seconds }};
            var el = document.getElementById('seconds');
            var timer = setInterval(function () {
                left -= 1;
                if (left <= 0) {
                    clearInterval(timer);
                    window.location.href = @json($home);
                    return;
                }
                el.textContent = left;
            }, 1000);
        })();
    </script>
</body>
</html>
