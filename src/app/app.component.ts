import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {

  //BANDERA
  isEditMode: boolean = false;
  existingInstanceWeeks: any[] = [];

async loadExistingData(): Promise<void> {
  this.projectInstances = [];
  this.existingInstanceWeeks = [];
  this.projectWeeks = [];
  this.isEditMode = false;

  for (const dept of this.projectDepartments) {
    const data = await this.timelineService.getInstanceAndWeeks(dept.id);

    if (!data) continue;

    if (data.instanceWeeks?.length > 0) {
      this.isEditMode = true;

      this.projectInstances.push(...data.instances);
      this.projectWeeks = data.weeks;
      this.existingInstanceWeeks.push(...data.instanceWeeks);

      // 👇 AQUÍ ESTÁ LO QUE TE FALTABA
      this.numberOfWeeks = data.weeks.length;

      this.generateTimelineByWeeks(
        new Date(data.weeks[0].startDate),
        this.numberOfWeeks
      );

      // Ahora sí la tabla existe
      this.mapBackendDataToTable(data);
    }
  }
}

//CARGAR LOS DATOS CUANDO EL BACKEND LOS DEVUELVA
mapBackendDataToTable(data: any): void {

  const { instances, weeks, instanceWeeks } = data;

  instanceWeeks.forEach((iw: any) => {

    const instance = instances.find(
      (i: any) => i.id === iw.projectRoleInstanceId
    );

    if (!instance) return;

    // Buscar el empleado correspondiente
    const rowIndex = this.allEmployeesByDept.findIndex(emp => {
      const match = emp.jobPositionName.match(/(\d+)$/);
      const instanceNumber = match ? parseInt(match[1], 10) : 1;

      return (
        emp.departmentId === instance.projectRoleDepartmentId &&
        instance.instanceNumber === instanceNumber
      );
    });

    if (rowIndex === -1) return;

    // Buscar semana
    const weekIndex = weeks.findIndex(
      (w: any) => w.id === iw.projectWeekId
    );

    if (weekIndex === -1) return;

    this.rowsByDepto[rowIndex][weekIndex] = iw.estimatedHours;
  });
}

// GUARDAR LOS DATOS O ACTUALIZAR
async onSave(): Promise<void> {
  if (this.isEditMode) {
    await this.updateHours();
  } else {
    await this.saveCompleteTimeline();
  }
}

getInstanceFromRow(rowIndex: number) {

  const emp = this.allEmployeesByDept[rowIndex];

  const match = emp.jobPositionName.match(/(\d+)$/);
  const instanceNumber = match ? parseInt(match[1], 10) : 1;

  const roleDepartment = this.projectDepartments.find(d =>
    d.departmentId === emp.departmentId &&
    d.jobPositionName === this.normalizeRole(emp.jobPositionName)
  );

  if (!roleDepartment) return null;

  return this.projectInstances.find(i =>
    i.projectRoleDepartmentId === roleDepartment.id &&
    i.instanceNumber === instanceNumber
  ) || null;
}

findExistingInstanceWeek(rowIndex: number, colIndex: number): any | null {

  const emp = this.allEmployeesByDept[rowIndex];

  const match = emp.jobPositionName.match(/(\d+)$/);
  const instanceNumber = match ? parseInt(match[1], 10) : 1;

  const roleDepartment = this.projectDepartments.find(d =>
    d.departmentId === emp.departmentId &&
    d.jobPositionName === this.normalizeRole(emp.jobPositionName)
  );

  if (!roleDepartment) return null;

  const instance = this.projectInstances.find(i =>
    i.projectRoleDepartmentId === roleDepartment.id &&
    i.instanceNumber === instanceNumber
  );

  if (!instance) return null;

  const week = this.projectWeeks[colIndex];

  if (!week) return null;

  return this.existingInstanceWeeks.find(e =>
    e.projectRoleInstanceId === instance.id &&
    e.projectWeekId === week.id
  ) || null;
}

//ACTUALIZAR DATOS
async updateHours(): Promise<void> {

  const updatePayload: any[] = [];
  const createPayload: any[] = [];

  for (let rowIndex = 0; rowIndex < this.rowsByDepto.length; rowIndex++) {
    const row = this.rowsByDepto[rowIndex];

    for (let colIndex = 0; colIndex < row.length; colIndex++) {

      const hours = row[colIndex];
      if (!hours) continue;

      const existing = this.findExistingInstanceWeek(rowIndex, colIndex);

      if (existing) {
        // PUT
        updatePayload.push({
          id: existing.id,
          projectRoleInstanceId: existing.projectRoleInstanceId,
          projectWeekId: existing.projectWeekId,
          estimatedHours: Number(hours),
          notes: null
        });
      } else {
        // POST nuevo registro
        const instance = this.getInstanceFromRow(rowIndex);
        const week = this.projectWeeks[colIndex];

        if (!instance || !week) continue;

        createPayload.push({
          projectRoleInstanceId: instance.id,
          projectWeekId: week.id,
          estimatedHours: Number(hours),
          notes: null
        });
      }
    }
  }

  if (updatePayload.length) {
    await firstValueFrom(this.timelineService.updateHours(updatePayload));
  }

  if (createPayload.length) {
    await firstValueFrom(this.timelineService.saveHoursPerWeek(createPayload));
  }
}
}
