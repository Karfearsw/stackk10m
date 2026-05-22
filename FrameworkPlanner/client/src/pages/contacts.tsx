import { Layout } from "@/components/layout/Layout";
import { CrmImportExportDialog } from "@/components/crm/CrmImportExportDialog";
import { ContactsWorkspace } from "@/components/contacts/ContactsWorkspace";

export default function Contacts() {
  return (
    <Layout>
      <ContactsWorkspace headerRight={<CrmImportExportDialog entityType="contact" />} />
    </Layout>
  );
}
