import { Routes } from "@angular/router";

export const routes: Routes = [
  {
    path: "",
    redirectTo: "home",
    pathMatch: "full",
  },
  {
    path: "home",
    loadComponent: () =>
      import("./pages/home/home.page").then((m) => m.HomePage),
  },
  {
    path: "post/:id",
    loadComponent: () =>
      import("./pages/post-detail/post-detail.page").then(
        (m) => m.PostDetailPage
      ),
  },
];
