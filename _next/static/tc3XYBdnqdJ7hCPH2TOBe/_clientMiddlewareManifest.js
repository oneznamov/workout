self.__MIDDLEWARE_MATCHERS = [
  {
    "regexp": "^\\/workout(?:\\/(_next\\/data\\/[^/]{1,}))?(?:\\/((?!api|_next\\/static|_next\\/image|favicon.ico|manifest.webmanifest|sw\\.js|pwa-icon|exercise-media|invite|reset|icon|apple-icon|.*\\.(?:png|svg|ico|webmanifest)$).*))(\\.json|\\.rsc|\\.segments\\/.+\\.segment\\.rsc)?[\\/#\\?]?$",
    "originalSource": "/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw\\.js|pwa-icon|exercise-media|invite|reset|icon|apple-icon|.*\\.(?:png|svg|ico|webmanifest)$).*)"
  }
];self.__MIDDLEWARE_MATCHERS_CB && self.__MIDDLEWARE_MATCHERS_CB()