/** Shape shared by every locale catalog: nested string leaves. */
export interface TranslationCatalog {
  [key: string]: string | TranslationCatalog
}
