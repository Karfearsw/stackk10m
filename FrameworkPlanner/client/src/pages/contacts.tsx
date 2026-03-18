import { Layout } from "@/components/layout/Layout";
import { CrmImportExportDialog } from "@/components/crm/CrmImportExportDialog";
import { ContactsManager } from "@/components/contacts/ContactsManager";

export default function Contacts() {
  return (
    <Layout>
      <ContactsManager headerRight={<CrmImportExportDialog entityType="contact" />} />
    </Layout>
  );
}

