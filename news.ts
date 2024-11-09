export interface News {
  Id: string;
  Created: string;
  Title: string;
  Summary: string;
  Url: string;
  Author: Author;
  Package?: string;
  Media?: string;
  Sections: Section[];
}

interface Author {
  Id: number;
  Name: string;
  Url: string;
  Online?: boolean;
  Score: number;
}

interface Section {
  Id: string;
  Title: string;
  Author: Author;
  SortOrder: number;
  Contents: string;
  Slug: string;
}
