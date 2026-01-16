import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Válasz objektum létrehozása, hogy tudjuk módosítani a sütiket (cookies)
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // Supabase kliens inicializálása a kérés és válasz kontextusában
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: any) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  // Aktuális munkamenet (session) ellenőrzése
  const { data: { session } } = await supabase.auth.getSession()

  // VÉDELEMI LOGIKA:
  // 1. Ha nincs bejelentkezve és nem a login oldalon van -> irány a login
  if (!session && !request.nextUrl.pathname.startsWith('/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // 2. Ha már be van jelentkezve, ne tudjon visszamenni a login oldalra
  if (session && request.nextUrl.pathname.startsWith('/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return response
}

// Meghatározzuk, mely útvonalakra fusson le a middleware (mindenre, kivéve statikus fájlok)
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}